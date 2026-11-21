import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import Stripe from "stripe";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
const port = process.env.PORT || 5000;

if (!process.env.MONGODB_URL) {
  throw new Error("MONGODB_URL is missing from .env");
}

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is missing from .env");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  }),
);
app.use("/payments/webhook", express.raw({ type: "application/json" }));

app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URL);
let cachedExchangeRate = null;
let rateLastFetched = 0;

async function convertBdtToUsd(bdtAmount) {
  const amount = Number(bdtAmount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid BDT amount");
  }

  const now = Date.now();
  const cacheDuration = 24 * 60 * 60 * 1000;

  if (!cachedExchangeRate || now - rateLastFetched >= cacheDuration) {
    const response = await fetch("https://open.er-api.com/v6/latest/USD");

    if (!response.ok) {
      throw new Error("Exchange rate API failed");
    }

    const data = await response.json();

    if (
      data.result !== "success" ||
      !Number.isFinite(Number(data.rates?.BDT)) ||
      Number(data.rates.BDT) <= 0
    ) {
      throw new Error("Invalid BDT exchange rate");
    }

    cachedExchangeRate = Number(data.rates.BDT);
    rateLastFetched = now;
  }

  const usdPrice = Number((amount / cachedExchangeRate).toFixed(2));

  if (usdPrice <= 0) {
    throw new Error("Converted USD amount is too small");
  }

  return {
    usdPrice,
    exchangeRate: cachedExchangeRate,
  };
}

async function startServer() {
  try {
    await client.connect();

    console.log("MongoDB Connected Successfully!");

    const db = client.db("salonbook");

    const futuredCollection = db.collection("futured");
    const appointmentsCollection = db.collection("appointments");
    const transactionsCollection = db.collection("transactions");
    const usersCollection = db.collection("user");

    
    const authBaseURL = process.env.BETTER_AUTH_URL;

if (!authBaseURL) {
  throw new Error("BETTER_AUTH_URL is missing from .env");
}

const JWKS = createRemoteJWKSet(
  new URL(`${authBaseURL}/api/auth/jwks`)
);

// JWT Verification Middleware
const verifyJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authorization token is required",
      });
    }

    const token = authHeader.slice(7);

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: authBaseURL,
      audience: authBaseURL,
    });

    if (!payload.sub) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload",
      });
    }

    const userId = payload.sub;

    const userConditions = [
      { _id: userId },
      { id: userId },
    ];

    if (ObjectId.isValid(userId)) {
      userConditions.push({
        _id: new ObjectId(userId),
      });
    }

    const user = await usersCollection.findOne({
      $or: userConditions,
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.isBlocked === true || user.banned === true) {
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked",
      });
    }

    req.user = {
      id: userId,
      role: user.role || "customer",
      email: user.email,
    };

    next();
  } catch (error) {
    console.error("JWT Verification Error:", error.message);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

// Admin Authorization Middleware
const verifyAdmin = (req, res, next) => {
  if (req.user?.role?.toLowerCase() !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin access required",
    });
  }

  next();
};

    app.get("/", (req, res) => {
      res.send("SalonBook Server is Running!");
    });
    app.get("/futured-all", async (req, res) => {
      try {
        const result = await futuredCollection.find({}).toArray();

        res.status(200).json(result);
      } catch (error) {
        console.error("Featured services error:", error);

        res.status(500).json({
          message: "Failed to fetch featured services",
        });
      }
    });
    app.get("/featured", async (req, res) => {
      try {
        const result = await futuredCollection.find({}).limit(6).toArray();

        res.status(200).json(result);
      } catch (error) {
        console.error("Featured API Error:", error);

        res.status(500).json({
          message: "Failed to get featured services",
        });
      }
    });
    app.get("/futured-all/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            message: "Invalid ID",
          });
        }

        const result = await futuredCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!result) {
          return res.status(404).json({
            message: "Service not found",
          });
        }

        res.status(200).json(result);
      } catch (error) {
        console.error(error);

        res.status(500).json({
          message: "Server error",
        });
      }
    });

app.post("/admin/services", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const {
      name,
      category,
      price,
      duration,
      description,
      image,
    } = req.body || {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof category !== "string" ||
      !category.trim() ||
      price === undefined ||
      typeof duration !== "string" ||
      !duration.trim() ||
      typeof description !== "string" ||
      !description.trim() ||
      typeof image !== "string" ||
      !image.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const bdtPrice = Number(price);

    if (!Number.isFinite(bdtPrice) || bdtPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid BDT price",
      });
    }

    const conversion = await convertBdtToUsd(bdtPrice);

    const newService = {
      name: name.trim(),
      category: category.trim(),

      price: bdtPrice,
      currency: "BDT",

      usdPrice: conversion.usdPrice,
      usdCurrency: "USD",
      exchangeRate: conversion.exchangeRate,

      duration: duration.trim(),
      description: description.trim(),
      image: image.trim(),

      isActive: true,
      status: "Active",

      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await futuredCollection.insertOne(newService);

    return res.status(201).json({
      success: true,
      message: "Service added successfully!",
      data: {
        _id: result.insertedId,
        ...newService,
      },
    });
  } catch (error) {
    console.error("Add Service Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to add service",
    });
  }
});



app.patch("/admin/services/:id", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service ID",
      });
    }

    const {
      name,
      category,
      price,
      duration,
      description,
      image,
      isActive,
    } = req.body || {};

    const bdtPrice = Number(price);

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof category !== "string" ||
      !category.trim() ||
      price === undefined ||
      price === null ||
      !Number.isFinite(bdtPrice) ||
      bdtPrice <= 0 ||
      typeof duration !== "string" ||
      !duration.trim() ||
      typeof description !== "string" ||
      !description.trim() ||
      typeof image !== "string" ||
      !image.trim() ||
      typeof isActive !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide valid service information",
      });
    }

    const conversion = await convertBdtToUsd(bdtPrice);

    const updatedService = {
      name: name.trim(),
      category: category.trim(),

      price: bdtPrice,
      currency: "BDT",

      usdPrice: conversion.usdPrice,
      usdCurrency: "USD",
      exchangeRate: conversion.exchangeRate,

      duration: duration.trim(),
      description: description.trim(),
      image: image.trim(),

      isActive,
      status: isActive ? "Active" : "Inactive",

      updatedAt: new Date(),
    };

    const result = await futuredCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedService }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    const service = await futuredCollection.findOne({
      _id: new ObjectId(id),
    });

    return res.status(200).json({
      success: true,
      message: "Service updated successfully",
      data: service,
    });
  } catch (error) {
    console.error("Update service error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update service",
    });
  }
});

   
app.patch("/admin/services/:id/status", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
const { isActive } = req.body || {};
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service ID",
      });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be true or false",
      });
    }

    const result = await futuredCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          isActive,
          status: isActive ? "Active" : "Inactive",
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: isActive
        ? "Service activated successfully"
        : "Service deactivated successfully",
    });
  } catch (error) {
    console.error("Update service status error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update service status",
    });
  }
});

   
app.delete("/admin/services/:id", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service ID",
      });
    }

    const result = await futuredCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Service deleted successfully",
    });
  } catch (error) {
    console.error("Delete Service Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete service",
    });
  }
});

 
app.post("/appointments", verifyJWT, async (req, res) => {
  try {
    const userId = req.user.id;

    // Only customers can book appointments
    if (req.user.role?.toLowerCase() !== "customer") {
      return res.status(403).json({
        success: false,
        message: "Only customers can book appointments",
      });
    }

    const { serviceId, appointmentDate, timeSlot, message } = req.body;

    if (!serviceId || !appointmentDate || !timeSlot) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required information",
      });
    }

    if (!ObjectId.isValid(serviceId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service ID",
      });
    }

    if (
      typeof appointmentDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment date",
      });
    }

    const parsedDate = new Date(`${appointmentDate}T00:00:00.000Z`);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== appointmentDate
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment date",
      });
    }

    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    if (appointmentDate < today) {
      return res.status(400).json({
        success: false,
        message: "Past dates are not allowed",
      });
    }

    const allowedTimeSlots = [
      "10:00 AM",
      "11:00 AM",
      "12:00 PM",
      "01:00 PM",
      "02:00 PM",
      "03:00 PM",
      "04:00 PM",
      "05:00 PM",
      "06:00 PM",
    ];

    if (!allowedTimeSlots.includes(timeSlot)) {
      return res.status(400).json({
        success: false,
        message: "Invalid time slot",
      });
    }

    if (
      message !== undefined &&
      (typeof message !== "string" || message.length > 500)
    ) {
      return res.status(400).json({
        success: false,
        message: "Message must be within 500 characters",
      });
    }

    // Find active service
    const service = await futuredCollection.findOne({
  _id: new ObjectId(serviceId),
  $and: [
    {
      $or: [
        { status: "Active" },
        { isActive: true },
      ],
    },
    {
      $nor: [
        { status: "Inactive" },
        { isActive: false },
      ],
    },
  ],
});

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found or unavailable",
      });
    }

    const bdtPrice = Number(service.price);

    if (!Number.isFinite(bdtPrice) || bdtPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid service BDT price",
      });
    }

    let usdPrice = Number(service.usdPrice);
    let exchangeRate = Number(service.exchangeRate);

    if (
      !Number.isFinite(usdPrice) ||
      usdPrice <= 0 ||
      !Number.isFinite(exchangeRate) ||
      exchangeRate <= 0
    ) {
      const conversion = await convertBdtToUsd(bdtPrice);

      usdPrice = conversion.usdPrice;
      exchangeRate = conversion.exchangeRate;

      await futuredCollection.updateOne(
        { _id: new ObjectId(serviceId) },
        {
          $set: {
            currency: "BDT",
            usdPrice,
            usdCurrency: "USD",
            exchangeRate,
            updatedAt: new Date(),
          },
        }
      );
    }

    // Prevent duplicate active time slots
    const existingAppointment = await appointmentsCollection.findOne({
      appointmentDate,
      timeSlot,
      status: {
        $in: ["Pending", "Confirmed"],
      },
    });

    if (existingAppointment) {
      return res.status(409).json({
        success: false,
        message: "This time slot is already booked",
      });
    }

    const newAppointment = {
      userId,
      serviceId: new ObjectId(serviceId),

      serviceName: service.name,
      serviceCategory: service.category || "",
      serviceImage: service.image || "",

      price: bdtPrice,
      currency: "BDT",

      usdPrice,
      usdCurrency: "USD",
      exchangeRate,

      duration: service.duration,

      appointmentDate,
      timeSlot,
      message: message?.trim() || "",

      status: "Pending",
      paymentStatus: "Unpaid",

      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await appointmentsCollection.insertOne(newAppointment);

    return res.status(201).json({
      success: true,
      message: "Appointment booked successfully!",
      data: {
        _id: result.insertedId,
        ...newAppointment,
      },
    });
  } catch (error) {
    console.error("Booking API Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to book appointment",
    });
  }
});

   
app.get("/appointments/user/:userId", verifyJWT, async (req, res) => {
  try {
    const { userId } = req.params;

    // Verify ownership: users can only see their own appointments
    if (userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to view these appointments",
      });
    }

    const appointments = await appointmentsCollection
      .find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    const appointmentsWithService = await Promise.all(
      appointments.map(async (appointment) => {
        let service = null;

        if (
          appointment.serviceId &&
          ObjectId.isValid(appointment.serviceId.toString())
        ) {
          service = await futuredCollection.findOne({
            _id: new ObjectId(appointment.serviceId),
          });
        }

        return {
          ...appointment,
          serviceImage:
            appointment.serviceImage || service?.image || "",
          serviceCategory:
            appointment.serviceCategory || service?.category || "N/A",
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: appointmentsWithService,
    });
  } catch (error) {
    console.error("Get Appointments Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch appointments",
    });
  }
});

    
app.get("/appointments/:id", verifyJWT, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID",
      });
    }

    // Find appointment belonging to authenticated user
    const appointment = await appointmentsCollection.findOne({
      _id: new ObjectId(id),
      userId: req.user.id,
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    const service =
      appointment.serviceId &&
      ObjectId.isValid(appointment.serviceId.toString())
        ? await futuredCollection.findOne({
            _id: new ObjectId(appointment.serviceId),
          })
        : null;

    return res.status(200).json({
      success: true,
      data: {
        ...appointment,
        serviceImage:
          appointment.serviceImage || service?.image || "",
        serviceCategory:
          appointment.serviceCategory || service?.category || "N/A",
      },
    });
  } catch (error) {
    console.error("Get Appointment Details Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch appointment details",
    });
  }
});

   
app.delete("/appointments/:id", verifyJWT, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID",
      });
    }

    // Only the appointment owner can cancel
    const result = await appointmentsCollection.updateOne(
      {
        _id: new ObjectId(id),
        userId: req.user.id,
        status: "Pending",
        paymentStatus: "Unpaid",
      },
      {
        $set: {
          status: "Cancelled",
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found or cannot be cancelled",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Appointment cancelled successfully",
    });
  } catch (error) {
    console.error("Cancel Appointment Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to cancel appointment",
    });
  }
});

   
app.patch("/appointments/:id/reschedule", verifyJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { appointmentDate, timeSlot } = req.body;

    const allowedTimeSlots = [
      "10:00 AM",
      "11:00 AM",
      "12:00 PM",
      "01:00 PM",
      "02:00 PM",
      "03:00 PM",
      "04:00 PM",
      "05:00 PM",
      "06:00 PM",
    ];

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID",
      });
    }

    if (!appointmentDate || !timeSlot) {
      return res.status(400).json({
        success: false,
        message: "Date and time are required",
      });
    }

    if (
      typeof appointmentDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment date",
      });
    }

    const parsedDate = new Date(`${appointmentDate}T00:00:00.000Z`);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== appointmentDate
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment date",
      });
    }

    if (!allowedTimeSlots.includes(timeSlot)) {
      return res.status(400).json({
        success: false,
        message: "Invalid time slot",
      });
    }

    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    if (appointmentDate < today) {
      return res.status(400).json({
        success: false,
        message: "Appointment date cannot be in the past",
      });
    }

    // Find appointment belonging to authenticated user
    const appointment = await appointmentsCollection.findOne({
      _id: new ObjectId(id),
      userId: req.user.id,
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    if (
      appointment.status !== "Pending" ||
      appointment.paymentStatus === "Paid"
    ) {
      return res.status(400).json({
        success: false,
        message: "Only unpaid pending appointments can be rescheduled",
      });
    }

    // Check whether the requested slot is already booked
    const existingAppointment = await appointmentsCollection.findOne({
      _id: { $ne: new ObjectId(id) },
      appointmentDate,
      timeSlot,
      status: {
        $in: ["Pending", "Confirmed"],
      },
    });

    if (existingAppointment) {
      return res.status(409).json({
        success: false,
        message: "This time slot is already booked",
      });
    }

    const updateResult = await appointmentsCollection.updateOne(
      {
        _id: new ObjectId(id),
        userId: req.user.id,
        status: "Pending",
        paymentStatus: "Unpaid",
      },
      {
        $set: {
          appointmentDate,
          timeSlot,
          updatedAt: new Date(),
        },
      }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(400).json({
        success: false,
        message: "Appointment could not be rescheduled",
      });
    }

    const updatedAppointment = await appointmentsCollection.findOne({
      _id: new ObjectId(id),
      userId: req.user.id,
    });

    return res.status(200).json({
      success: true,
      message: "Appointment rescheduled successfully",
      data: updatedAppointment,
    });
  } catch (error) {
    console.error("Reschedule Appointment Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to reschedule appointment",
    });
  }
});

   
app.get(
  "/admin/appointments",
  verifyJWT,
  verifyAdmin,
  async (req, res) => {
    try {
      const appointments = await appointmentsCollection
        .find({})
        .sort({ createdAt: -1 })
        .toArray();

      const appointmentsWithDetails = await Promise.all(
        appointments.map(async (appointment) => {
          let service = null;

          if (
            appointment.serviceId &&
            ObjectId.isValid(appointment.serviceId.toString())
          ) {
            service = await futuredCollection.findOne({
              _id: new ObjectId(appointment.serviceId),
            });
          }

          const userId = appointment.userId;

          const userConditions = [
            { _id: userId },
            { id: userId },
          ];

          if (ObjectId.isValid(userId)) {
            userConditions.push({
              _id: new ObjectId(userId),
            });
          }

          const customer = await usersCollection.findOne({
            $or: userConditions,
          });

          return {
            ...appointment,

            serviceImage:
              appointment.serviceImage || service?.image || "",
            serviceCategory:
              appointment.serviceCategory || service?.category || "N/A",

            customerName:
              customer?.name || customer?.fullName || "Unknown Customer",

            customerEmail:
              customer?.email || "Email not available",
          };
        })
      );

      return res.status(200).json({
        success: true,
        data: appointmentsWithDetails,
      });
    } catch (error) {
      console.error("Admin Appointments Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch appointments",
      });
    }
  }
);

app.patch(
  "/admin/appointments/:id/status",
  verifyJWT,
  verifyAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const allowedStatuses = [
        "Pending",
        "Confirmed",
        "Completed",
        "Cancelled",
      ];

      // Validate appointment ID
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid appointment ID",
        });
      }

      // Validate status
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid appointment status",
        });
      }

      // Find appointment
      const appointment = await appointmentsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!appointment) {
        return res.status(404).json({
          success: false,
          message: "Appointment not found",
        });
      }

      // Confirm validation
      if (status === "Confirmed" && appointment.status !== "Pending") {
        return res.status(400).json({
          success: false,
          message: "Only pending appointments can be confirmed",
        });
      }

      // Complete validation
      if (status === "Completed") {
        if (appointment.status !== "Confirmed") {
          return res.status(400).json({
            success: false,
            message: "Only confirmed appointments can be completed",
          });
        }

        if (appointment.paymentStatus !== "Paid") {
          return res.status(400).json({
            success: false,
            message: "Payment must be completed before completing appointment",
          });
        }
      }

      // Cancel validation
      if (
        status === "Cancelled" &&
        !["Pending", "Confirmed"].includes(appointment.status)
      ) {
        return res.status(400).json({
          success: false,
          message: "This appointment cannot be cancelled",
        });
      }

      // Update appointment
      const result = await appointmentsCollection.updateOne(
        {
          _id: new ObjectId(id),
          status: appointment.status,
          paymentStatus: appointment.paymentStatus,
        },
        {
          $set: {
            status,
            updatedAt: new Date(),
          },
        }
      );

      if (result.modifiedCount === 0) {
        return res.status(409).json({
          success: false,
          message: "Appointment status or payment status has already changed",
        });
      }

      // Get updated appointment
      const updatedAppointment = await appointmentsCollection.findOne({
        _id: new ObjectId(id),
      });

      return res.status(200).json({
        success: true,
        message: `Appointment ${status.toLowerCase()} successfully`,
        data: updatedAppointment,
      });
    } catch (error) {
      console.error("Admin Update Appointment Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update appointment status",
      });
    }
  }
);


    
app.get("/admin/users", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const users = await usersCollection
      .find(
        {},
        {
          projection: {
            name: 1,
            email: 1,
            role: 1,
            image: 1,
            createdAt: 1,
            isBlocked: 1,
          },
        }
      )
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("Get Admin Users Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch users",
    });
  }
});

 
app.patch(
  "/admin/users/:id/status",
  verifyJWT,
  verifyAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { isBlocked } = req.body || {};

      if (typeof isBlocked !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "isBlocked must be true or false",
        });
      }

      const userConditions = [
        { _id: id },
        { id: id },
      ];

      if (ObjectId.isValid(id)) {
        userConditions.push({
          _id: new ObjectId(id),
        });
      }

      const user = await usersCollection.findOne({
        $or: userConditions,
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Admin cannot be blocked
      if (user.role?.toLowerCase() === "admin") {
        return res.status(403).json({
          success: false,
          message: "Admin cannot be blocked",
        });
      }

      const result = await usersCollection.updateOne(
        { _id: user._id },
        {
          $set: {
            isBlocked,
            banned: isBlocked,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found during update",
        });
      }

      return res.status(200).json({
        success: true,
        message: isBlocked
          ? "User blocked successfully"
          : "User unblocked successfully",
        data: {
          id: user.id || user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          isBlocked,
          banned: isBlocked,
        },
      });
    } catch (error) {
      console.error("User Status Update Error:", error);

      return res.status(500).json({
        success: false,
        message: error.message || "Failed to update user status",
      });
    }
  }
);

app.post(
  "/payments/create-checkout-session",
  verifyJWT,
  async (req, res) => {
    try {
      const { appointmentId } = req.body;

      // Get authenticated user ID from JWT
      const userId = req.user.id;

      // 1. Required field validation
      if (!appointmentId) {
        return res.status(400).json({
          success: false,
          message: "Appointment ID is required",
        });
      }

      // 2. Validate appointment ID
      if (!ObjectId.isValid(appointmentId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid appointment ID",
        });
      }

      // 3. Find appointment belonging to authenticated user
      const appointment = await appointmentsCollection.findOne({
        _id: new ObjectId(appointmentId),
        userId,
      });

      if (!appointment) {
        return res.status(404).json({
          success: false,
          message: "Appointment not found",
        });
      }

      // 4. Check appointment status
      if (appointment.status !== "Confirmed") {
        return res.status(400).json({
          success: false,
          message: "Only confirmed appointments can be paid",
        });
      }

      // 5. Check payment status
      if (appointment.paymentStatus === "Paid") {
        return res.status(400).json({
          success: false,
          message: "Appointment is already paid",
        });
      }

      // 6. Validate USD price
      const usdPrice = Number(appointment.usdPrice);

      if (!Number.isFinite(usdPrice) || usdPrice <= 0) {
        return res.status(400).json({
          success: false,
          message:
            "Valid USD price is not configured for this appointment. Please update the service and book again.",
        });
      }

      const frontendUrl =
        process.env.FRONTEND_URL || "http://localhost:3000";

      // 7. Create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        mode: "payment",

        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: appointment.serviceName,
                description: `Appointment: ${appointment.appointmentDate} at ${appointment.timeSlot}`,
              },
              unit_amount: Math.round(usdPrice * 100),
            },
            quantity: 1,
          },
        ],

        client_reference_id: appointment._id.toString(),

        metadata: {
          appointmentId: appointment._id.toString(),
          userId: String(userId),
          usdPrice: usdPrice.toString(),
          bdtPrice: String(appointment.price),
          exchangeRate: String(appointment.exchangeRate || ""),
        },

        payment_intent_data: {
          metadata: {
            appointmentId: appointment._id.toString(),
            userId: String(userId),
          },
        },

        success_url: `${frontendUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl}/payment/cancel`,
      });

      console.log("CHECKOUT SESSION ID:", session.id);
      console.log("CHECKOUT SESSION METADATA:", session.metadata);

      return res.status(200).json({
        success: true,
        message: "Stripe checkout session created",
        url: session.url,
        sessionId: session.id,
      });
    } catch (error) {
      console.error("Stripe Checkout Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create checkout session",
      });
    }
  }
);

   
app.post("/payments/webhook", async (req, res) => {
  console.log("1. Webhook request received!");

  const signature = req.headers["stripe-signature"];

  let event;

  // Verify Stripe signature
  try {
    if (!signature || !Buffer.isBuffer(req.body)) {
      return res.status(400).send("Invalid webhook request");
    }

    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    console.log("Stripe event:", event.type);
  } catch (error) {
    console.error("Webhook Signature Error:", error.message);
    return res.status(400).send("Webhook signature verification failed");
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      if (session.payment_status !== "paid") {
        return res.status(200).json({ received: true });
      }

      const appointmentId = session.metadata?.appointmentId;
      const userId = session.metadata?.userId;

      if (!appointmentId || !userId) {
        console.log("Missing appointment metadata");
        return res.status(200).json({ received: true });
      }

      if (!ObjectId.isValid(appointmentId)) {
        return res.status(400).json({ received: false });
      }

      const appointment = await appointmentsCollection.findOne({
        _id: new ObjectId(appointmentId),
        userId,
      });

      if (!appointment) {
        console.error("Appointment not found:", appointmentId);
        return res.status(404).json({ received: false });
      }

      // Update payment status only after verified Stripe payment
      await appointmentsCollection.updateOne(
        {
          _id: appointment._id,
          userId,
          paymentStatus: { $ne: "Paid" },
        },
        {
          $set: {
            paymentStatus: "Paid",
            stripeSessionId: session.id,
            stripePaymentIntentId: session.payment_intent || null,
            paidAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );

      // Save transaction only once
      await transactionsCollection.updateOne(
        { stripeSessionId: session.id },
        {
          $setOnInsert: {
            appointmentId: appointment._id,
            userId,
            serviceName: appointment.serviceName,
            amount: Number(session.amount_total) / 100,
            currency: session.currency?.toUpperCase(),
            paymentStatus: "Paid",
            stripeSessionId: session.id,
            stripePaymentIntentId: session.payment_intent || null,
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );

      console.log("Payment and transaction processed:", session.id);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook Processing Error:", error);

    return res.status(500).json({
      received: false,
      message: "Webhook processing failed",
    });
  }
});

app.post("/payments/verify-session", verifyJWT, async (req, res) => {
  try {
    const { sessionId } = req.body;
    const userId = req.user.id;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Stripe session ID is required",
      });
    }

    // Retrieve Stripe checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.mode !== "payment" || session.payment_status !== "paid") {
      return res.status(400).json({
        success: false,
        message: "Payment has not been completed",
      });
    }

    // Verify session belongs to the logged-in user
    const appointmentId = session.metadata?.appointmentId;
    const sessionUserId = session.metadata?.userId;

    if (
      !appointmentId ||
      !ObjectId.isValid(appointmentId) ||
      !sessionUserId ||
      sessionUserId !== userId
    ) {
      return res.status(403).json({
        success: false,
        message: "Invalid payment session or unauthorized access",
      });
    }

    // Verify appointment ownership
    const appointment = await appointmentsCollection.findOne({
      _id: new ObjectId(appointmentId),
      userId,
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    // Only verify payment here.
    // Webhook is responsible for updating database payment status.

    return res.status(200).json({
      success: true,
      message: "Payment verified. Waiting for webhook confirmation.",
      paymentStatus: appointment.paymentStatus,
      stripePaymentStatus: session.payment_status,
    });
  } catch (error) {
    console.error("Payment verification error:", error);

    return res.status(500).json({
      success: false,
      message: "Payment verification failed",
    });
  }
});


app.get("/admin/transactions", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    // Get all transactions
    const transactions = await transactionsCollection
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    // Get customer and appointment details
    const result = await Promise.all(
      transactions.map(async (transaction) => {
        const appointmentId = transaction.appointmentId;
        const userId = transaction.userId;

        const appointment = await appointmentsCollection.findOne({
          _id: appointmentId instanceof ObjectId
            ? appointmentId
            : new ObjectId(appointmentId),
        });

        const userConditions = [
          { _id: userId },
          { id: userId },
        ];

        if (ObjectId.isValid(userId)) {
          userConditions.push({
            _id: new ObjectId(userId),
          });
        }

        const user = await usersCollection.findOne({
          $or: userConditions,
        });

        return {
          ...transaction,
          _id: transaction._id.toString(),
          customerName: user?.name || "Unknown Customer",
          customerEmail: user?.email || "",
          serviceName: appointment?.serviceName || "—",
        };
      })
    );

    return res.status(200).json({
      success: true,
      total: result.length,
      data: result,
    });
  } catch (error) {
    console.error("Get transactions error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch transactions",
    });
  }
});


    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("MongoDB Connection Failed:", error);
    process.exit(1);
  }
}

startServer();
