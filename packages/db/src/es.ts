import { Client } from "@elastic/elasticsearch";
import "dotenv/config";

export class ESDB {
  public static instance: ESDB;
  public client: Client;

  constructor() {
    if (ESDB.instance) throw Error("ESDB can only have a single instance");

    ESDB.instance = this;
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

  static async connect() {}

  static async disconnect() {
    ESDB.instance.client.close();
  }
}

new ESDB();

export const es: Client = ESDB.instance.client;
