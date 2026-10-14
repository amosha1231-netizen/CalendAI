import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { installAuthFetch } from "./utils/authFetch";

// Must run before the first API call so every request carries the JWT.
installAuthFetch();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);