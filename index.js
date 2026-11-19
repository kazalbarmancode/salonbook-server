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

    if (!userId || !serviceId || !appointmentDate || !timeSlot) {
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
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("MongoDB Connection Failed:", error);
    process.exit(1);
  }
}

startServer();
