const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/map-data", function (req, res) {
  const file = path.join(__dirname, "data.json");
  fs.readFile(file, "utf8", function (err, text) {
    if (err) {
      res.status(500).json({ error: "data.json not found" });
      return;
    }
    res.type("application/json").send(text);
  });
});

app.listen(PORT, function () {
  console.log("Campus map running at http://localhost:" + PORT);
});
