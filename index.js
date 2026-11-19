import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);app.use(express.json());

if (!process.env.MONGODB_URL) {
  throw new Error("MONGODB_URL is missing from .env");
}

const client = new MongoClient(process.env.MONGODB_URL);

async function startServer() {
  try {
    await client.connect();

    console.log("MongoDB Connected Successfully!");

    const db = client.db("salonbook");

    const futuredCollection = db.collection("futured");
    const appointmentsCollection = db.collection("appointments");
    const usersCollection = db.collection("user");


    app.get("/", (req, res) => {
      res.send("SalonBook Server is Running!");
    });

    // future collection all

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
        const result = await futuredCollection.find().limit(6).toArray();
        res.status(200).send(result);
      } catch (error) {
        console.error("Featured API Error:", error);
        res.status(500).send({ message: "Failed to get featured services" });
      }
    });
    app.get("/futured-all/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            message: "Invalid ID",
          });
        }

        const result = await futuredCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!result) {
          return res.status(404).send({
            message: "Service not found",
          });
        }

        res.status(200).send(result);
      } catch (error) {
        console.error(error);

        res.status(500).send({
          message: "Server error",
        });
      }
    });


    // add new services

app.post("/admin/services", async (req, res) => {
  try {
    const {
      name,
      category,
      price,
      duration,
      description,
      image,
    } = req.body;

    if (
      !name?.trim() ||
      !category?.trim() ||
      price === undefined ||
      !duration?.trim() ||
      !description?.trim() ||
      !image?.trim()
    ) {
      return res.status(400).send({
        success: false,
        message: "All fields are required",
      });
    }

    const servicePrice = Number(price);

    if (!Number.isFinite(servicePrice) || servicePrice <= 0) {
      return res.status(400).send({
        success: false,
        message: "Please provide a valid price",
      });
    }

    const newService = {
      name: name.trim(),
      category: category.trim(),
      price: servicePrice,
      duration: duration.trim(),
      description: description.trim(),
      image: image.trim(),
      isActive: true,
      createdAt: new Date(),
    };

    const result = await futuredCollection.insertOne(newService);

    res.status(201).send({
      success: true,
      message: "Service added successfully!",
      data: {
        _id: result.insertedId,
        ...newService,
      },
    });

  } catch (error) {
    console.error("Add Service Error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to add service",
    });
  }
});


app.patch("/admin/services/:id", async (req, res) => {
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
    } = req.body;

    if (
      typeof name !== "string" || !name.trim() ||
      typeof category !== "string" || !category.trim() ||
      price === undefined || price === null ||
      !Number.isFinite(Number(price)) || Number(price) < 0 ||
      typeof duration !== "string" || !duration.trim() ||
      typeof description !== "string" || !description.trim() ||
      typeof image !== "string" || !image.trim() ||
      typeof isActive !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide valid service information",
      });
    }

    const updatedService = {
      name: name.trim(),
      category: category.trim(),
      price: Number(price),
      duration: duration.trim(),
      description: description.trim(),
      image: image.trim(),
      isActive,
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



app.patch("/admin/services/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

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



app.delete("/admin/services/:id", async (req, res) => {
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
    console.error("Delete service error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete service",
    });
  }
});

// POST: BOOK APPOINTMENT

app.post("/appointments", async (req, res) => {
  try {
    const {
      userId,
      serviceId,
      appointmentDate,
      timeSlot,
      message,
    } = req.body;

    // 1. Required field validation
    if (!userId || !serviceId || !appointmentDate || !timeSlot) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required information",
      });
    }

    // 2. Check customer account
    const userConditions = [
      { id: userId },
      { _id: userId },
    ];

    if (ObjectId.isValid(userId)) {
      userConditions.push({
        _id: new ObjectId(userId),
      });
    }

    const customer = await usersCollection.findOne({
      $or: userConditions,
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer account not found",
      });
    }

    // 3. Blocked user check
    if (
      customer.isBlocked === true ||
      customer.banned === true
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Your account has been blocked. You cannot book appointments.",
      });
    }

    // 4. Service ID validation
    if (!ObjectId.isValid(serviceId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service ID",
      });
    }

    // 5. Appointment date validation
    if (
      typeof appointmentDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment date",
      });
    }

    const parsedDate = new Date(
      `${appointmentDate}T00:00:00.000Z`
    );

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

    // 6. Allowed time slots
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

    // 7. Message validation
    if (
      message !== undefined &&
      (typeof message !== "string" || message.length > 500)
    ) {
      return res.status(400).json({
        success: false,
        message: "Message must be within 500 characters",
      });
    }

    // 8. Check service availability
    const service = await futuredCollection.findOne({
      _id: new ObjectId(serviceId),
      isActive: true,
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found or unavailable",
      });
    }

    // 9. Check existing appointment
    const existingAppointment =
      await appointmentsCollection.findOne({
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

    // 10. Create new appointment
    const newAppointment = {
      userId,
      serviceId: new ObjectId(serviceId),

      serviceName: service.name,
      price: Number(service.price),
      duration: service.duration,

      appointmentDate,
      timeSlot,
      message: message?.trim() || "",

      status: "Pending",
      paymentStatus: "Unpaid",

      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await appointmentsCollection.insertOne(
      newAppointment
    );

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

// Get Customer Appointments
app.get("/appointments/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const appointments = await appointmentsCollection
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();

    const appointmentsWithService = await Promise.all(
      appointments.map(async (appointment) => {
        let service = null;

        if (ObjectId.isValid(appointment.serviceId)) {
          service = await futuredCollection.findOne({
            _id: new ObjectId(appointment.serviceId),
          });
        }

        return {
          ...appointment,
          serviceImage: service?.image || "",
          serviceCategory: service?.category || "N/A",
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


app.get("/appointments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID",
      });
    }

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const appointment = await appointmentsCollection.findOne({
      _id: new ObjectId(id),
      userId,
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    const service = ObjectId.isValid(appointment.serviceId)
      ? await futuredCollection.findOne({
          _id: new ObjectId(appointment.serviceId),
        })
      : null;

    return res.status(200).json({
      success: true,
      data: {
        ...appointment,
        serviceImage: service?.image || "",
        serviceCategory: service?.category || "N/A",
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
// Delete Customer Appointment
app.delete("/appointments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID",
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const result = await appointmentsCollection.deleteOne({
      _id: new ObjectId(id),
      userId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Appointment deleted successfully",
    });
  } catch (error) {
    console.error("Delete Appointment Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete appointment",
    });
  }
});
app.patch("/appointments/:id/reschedule", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, appointmentDate, timeSlot } = req.body;

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
      return res.status(400).json({ success: false, message: "Invalid appointment ID" });
    }

    if (!userId || !appointmentDate || !timeSlot) {
      return res.status(400).json({ success: false, message: "User, date and time are required" });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)) {
      return res.status(400).json({ success: false, message: "Invalid appointment date" });
    }

    if (!allowedTimeSlots.includes(timeSlot)) {
      return res.status(400).json({ success: false, message: "Invalid time slot" });
    }

    // Bangladesh local date
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    if (appointmentDate < today) {
      return res.status(400).json({ success: false, message: "Appointment date cannot be in the past" });
    }

    const appointment = await appointmentsCollection.findOne({
      _id: new ObjectId(id),
      userId,
    });

    if (!appointment) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    if (appointment.status !== "Pending") {
      return res.status(400).json({ success: false, message: "Only pending appointments can be rescheduled" });
    }

    // Check whether another active appointment has taken this slot
    const existingAppointment = await appointmentsCollection.findOne({
      _id: { $ne: new ObjectId(id) },
      appointmentDate,
      timeSlot,
      status: { $in: ["Pending", "Confirmed"] },
    });

    if (existingAppointment) {
      return res.status(409).json({ success: false, message: "This time slot is already booked" });
    }

    await appointmentsCollection.updateOne(
      { _id: new ObjectId(id), userId, status: "Pending" },
      {
        $set: {
          appointmentDate,
          timeSlot,
          updatedAt: new Date(),
        },
      }
    );

    const updatedAppointment = await appointmentsCollection.findOne({
      _id: new ObjectId(id),
    });

    return res.status(200).json({
      success: true,
      message: "Appointment rescheduled successfully",
      data: updatedAppointment,
    });
  } catch (error) {
    console.error("Reschedule Appointment Error:", error);
    return res.status(500).json({ success: false, message: "Failed to reschedule appointment" });
  }
});
// GET: ALL APPOINTMENTS FOR ADMIN

app.get("/admin/appointments", async (req, res) => {
  try {
    const appointments = await appointmentsCollection
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    const appointmentsWithDetails = await Promise.all(
      appointments.map(async (appointment) => {
        // Get service information
        let service = null;

        if (ObjectId.isValid(appointment.serviceId)) {
          service = await futuredCollection.findOne({
            _id: new ObjectId(appointment.serviceId),
          });
        }

        // Get customer information
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

          // Service details
          serviceImage: service?.image || "",
          serviceCategory: service?.category || "N/A",

          // Customer details
          customerName:
            customer?.name ||
            customer?.fullName ||
            "Unknown Customer",

          customerEmail:
            customer?.email ||
            "Email not available",
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
});

// PATCH: UPDATE APPOINTMENT STATUS FOR ADMIN
app.patch("/admin/appointments/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = [
      "Pending",
      "Confirmed",
      "Completed",
      "Cancelled",
    ];

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID",
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment status",
      });
    }

    const appointment = await appointmentsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    if (
      status === "Confirmed" &&
      appointment.status !== "Pending"
    ) {
      return res.status(400).json({
        success: false,
        message: "Only pending appointments can be confirmed",
      });
    }

    if (
      status === "Completed" &&
      appointment.status !== "Confirmed"
    ) {
      return res.status(400).json({
        success: false,
        message: "Only confirmed appointments can be completed",
      });
    }

    if (
      status === "Cancelled" &&
      !["Pending", "Confirmed"].includes(appointment.status)
    ) {
      return res.status(400).json({
        success: false,
        message: "This appointment cannot be cancelled",
      });
    }

    const updatedAt = new Date();

    const result = await appointmentsCollection.updateOne(
      {
        _id: new ObjectId(id),
        status: appointment.status,
      },
      {
        $set: {
          status,
          updatedAt,
        },
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(409).json({
        success: false,
        message: "Appointment status has already changed",
      });
    }

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
});
app.get("/admin/users", async (req, res) => {
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

app.patch("/admin/users/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { isBlocked } = req.body;

    if (typeof isBlocked !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isBlocked must be true or false",
      });
    }

    const user = await usersCollection.findOne({
      $or: [
        { _id: id },
        ...(ObjectId.isValid(id)
          ? [{ _id: new ObjectId(id) }]
          : []),
      ],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.role?.toLowerCase() === "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin cannot be blocked",
      });
    }

    await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: {
          isBlocked,
          updatedAt: new Date(),
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: isBlocked
        ? "User blocked successfully"
        : "User unblocked successfully",
      data: {
        ...user,
        isBlocked,
      },
    });
  } catch (error) {
    console.error("User Status Update Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update user status",
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
