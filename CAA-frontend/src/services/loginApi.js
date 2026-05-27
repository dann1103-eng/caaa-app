import axios from "axios";

import { API_URL } from "../api/axiosConfig";

export const login = async (username, password) => {
  const res = await axios.post(`${API_URL}/auth/login`, {
    username,
    password
  });
  return res.data;
};
