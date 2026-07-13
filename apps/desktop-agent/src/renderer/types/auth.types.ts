export interface User {
  userId: string;

  role: string;
}

export interface LoginResponse {
  success: boolean;

  message: string;

  data: {
    token: string;

    user: User;
  };
}
