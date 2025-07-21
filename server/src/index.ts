import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { authMiddleware } from "./middleware/authMiddleware";

/*ROUTE IMPORT */
import tenantRoutes from "./routes/tenantRoutes";
import managerRoutes from "./routes/managerRoutes";
import propertyRoutes from "./routes/propertyRoutes";
import leaseRoutes from "./routes/leaseRoutes";
import applicationRoutes from "./routes/applicationRoutes";

/* CONFIGURATIONS*/
dotenv.config(); //loads env variables from .env in to process.en
const app = express(); // initializes express

app.use(express.json()); // parses incoming requests with JSON payloads into req.body.
app.use(helmet()); //Adds a collection of security-related HTTP headers to protect against common vulnerabilities (XSS, clickjacking, etc.).
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" })); //Allows resources to be shared across origins (e.g., fonts, images).
app.use(morgan("common")); //Sets up HTTP request logging in the "common" format.
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false })); // parse incoming requests with application/x-www-form-urlencoded data, typically sent by HTML form submissions.
app.use(cors()); //Enables Cross-Origin Resource Sharing, allowing your API to be accessed by clients from other domains.

/* ROUTES */
/* user should be manager to access the route*/
app.get("/", (req, res) => {
  res.send("This is home route");
});
app.use("/applications", applicationRoutes);
app.use("/properties", propertyRoutes);
app.use("/leases", leaseRoutes);

app.use("/tenants", authMiddleware(["tenant"]), tenantRoutes);
app.use("/managers", authMiddleware(["manager"]), managerRoutes);

/* SERVER */
const port = Number(process.env.PORT) || 3002;
app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
