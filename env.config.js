require("dotenv").config();

const BASE_URL = process.env.API_BASE_URL || "http://localhost:5000";

module.exports = BASE_URL;
