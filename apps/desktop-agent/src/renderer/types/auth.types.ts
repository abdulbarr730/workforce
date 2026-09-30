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

    // Signed in with a one-time password: set your own before anything else.
    mustChangePassword?: boolean;
  };
}
