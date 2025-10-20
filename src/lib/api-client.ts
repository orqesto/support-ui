import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    // Read token from Zustand's persisted storage
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      try {
        const { state } = JSON.parse(authStorage);
        const token = state?.token;
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (error) {
        console.error('Error parsing auth storage:', error);
      }
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
