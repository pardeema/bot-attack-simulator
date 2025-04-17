# Use the official Microsoft Playwright image with Node.js (Jammy variant)
# Updated to match the required version from the error logs.
FROM mcr.microsoft.com/playwright:v1.52.0-jammy

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock)
COPY package*.json ./

# Install only production dependencies using npm ci (clean install)
# The base image already has Node.js and npm installed.
# It also includes Playwright browsers, so no need for 'npx playwright install' here.
RUN npm ci --only=production

# Copy the rest of your application code into the container
COPY . .

# Expose the port your application runs on (from server.js)
EXPOSE 3000

# Define the command to start your application
CMD ["node", "server.js"]

