import axios from 'axios';
import { API_BASE_URL, getAuthToken } from './config';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    
    // Extract error message from response
    if (error.response?.data) {
      const errorData = error.response.data;
      const errorMessage = errorData.error || errorData.message || error.message;
      
      // Create a more detailed error with status and message
      const enhancedError = new Error(errorMessage);
      (enhancedError as Error & { status: number; data: unknown }).status = error.response.status;
      (enhancedError as Error & { status: number; data: unknown }).data = errorData;
      
      return Promise.reject(enhancedError);
    }
    
    return Promise.reject(error);
  }
);
