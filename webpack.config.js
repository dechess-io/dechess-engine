// Copyright 2023 Transflox LLC. All rights reserved.

const path = require("path");
const nodeExternals = require("webpack-node-externals");
const NodemonPlugin = require("nodemon-webpack-plugin");

module.exports = {
  entry: "./src/main.ts",
  devtool: "source-map",
  target: "node",
  externals: [nodeExternals()],
  resolve: { extensions: [".ts", ".tsx", ".js"] },
  module: {
    rules: [
      { test: /\.tsx?$/, use: "ts-loader", exclude: /node_modules/ },
      { test: /\.js$/, loader: "source-map-loader" },
    ],
  },
  output: { filename: "main.js", path: path.resolve(__dirname, "dist") },
  experiments: {
    topLevelAwait: true,
  },
  stats: {
    warnings: false,
    errorDetails: true,
  },
  plugins: [new NodemonPlugin()],
  node: {
    __dirname: true,
  },
};
