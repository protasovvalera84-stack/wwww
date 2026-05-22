FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json .
RUN npm install --production

# Copy purger script
COPY purger.js .

# Run as non-root
USER node

CMD ["node", "purger.js"]
