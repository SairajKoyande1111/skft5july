module.exports = {
  apps: [
    {
      name: "fishtokriwebsite",
      script: "dist/index.cjs",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: 3013,
        MONGODB_URI: "mongodb://admin:FishTokri%40132231@187.127.174.48:27017/?authSource=admin",
        SESSION_SECRET: "4ht7xAFRChv4cXoq7wxN95DCONA9VrRalzJjMP7QlxcIp4QjKhHl2aC4snWbF5EwL7EKkOSSmyT7NEEEtsQn7Q==",
        VITE_GOOGLE_MAPS_API_KEY: "AIzaSyDe3GaC52SlaWDAFgFgod6Pwa1xZ0Lfw9o",
        AISENSY_API_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4MTcxOTAzYjYyZWI0MGMwMGZkMzNhZiIsIm5hbWUiOiJBVEhBIEZPT0RTIFBSSVZBVEUgTElNSVRFRCIsImFwcE5hbWUiOiJBaVNlbnN5IiwiY2xpZW50SWQiOiI2ODE3MTkwM2I2MmViNDBjMDBmZDMzYWEiLCJhY3RpdmVQbGFuIjoiRlJFRV9GT1JFVkVSIiwiaWF0IjoxNzQ2MzQ0MTk1fQ.NLo_rY9qgxbrE9c3iKRJPcd8mPc5l2NCr-5XdsRUiqM",
        AISENSY_USERNAME: "ATHA FOODS PRIVATE LIMITED",
        RAZORPAY_KEY_ID: "rzp_live_T50Ny5Ok8wBo6y",
        RAZORPAY_KEY_SECRET: "AWBbIhzhOj218hqVpP3taBkH"
      }
    }
  ]
};
