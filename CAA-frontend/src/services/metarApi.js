import axios from "axios";

import { API_URL } from "../api/axiosConfig";

export const getMetar = async () => {
  const res = await axios.get(`${API_URL}/metar`);
  return res.data;
};
