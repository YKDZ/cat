import { Client } from "@elastic/elasticsearch";

export class ESDB {
  public static instance: ESDB;
  public client: Client;

  constructor() {
    if (ESDB.instance) throw Error("ESDB can only have a single instance");
    // if (
    //   !process.env.ES_API_KEY_ID ||
    //   !process.env.ES_API_KEY_ID ||
    //   !process.env.ES_API_KEY
    // )
    //   throw new Error(
    //     "Can not create ElisticSearch client cause lack of enviroment varibles",
    //   );

    ESDB.instance = this;
    this.client = new Client({
      node: "https://127.0.0.1:9200",
      auth: {
        username: "elastic",
        password: "1256987qazA!",
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
