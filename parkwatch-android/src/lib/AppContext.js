import { createContext } from 'react';

export const AppContext = createContext({
  isAdmin: false,
  handleAdminLogout: () => {},
});