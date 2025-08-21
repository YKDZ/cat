import "dotenv/config";
import { Client } from "@elastic/elasticsearch";

export class ESDB {
  public client: Client;

  constructor() {
    this.client = new Client({
      node: process.env.ES_URL,
      auth: {
        username: process.env.ES_AUTH_USERNAME || "elastic",
        password: process.env.ES_AUTH_PASSWORD || "elastic",
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  async connect() {}

  async disconnect() {
    this.client.close();
  }

  async ping() {
    await this.client.ping();
  }
}
