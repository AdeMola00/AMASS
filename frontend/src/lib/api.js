import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({ baseURL: API, headers: { "Content-Type": "application/json" } });

export async function submitLead(payload) {
  const { data } = await client.post("/leads", payload);
  return data;
}

export async function subscribeNewsletter(email) {
  const { data } = await client.post("/newsletter", { email });
  return data;
}
