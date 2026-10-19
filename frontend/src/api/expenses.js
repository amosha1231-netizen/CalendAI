import api from './axios';

export const listExpenses = (status) =>
  api.get('/api/expenses', { params: status ? { status } : {} }).then(r => r.data);

export const getExpenseSummary = () =>
  api.get('/api/expenses/summary').then(r => r.data);

export const createExpense = (data) =>
  api.post('/api/expenses', data).then(r => r.data);

export const updateExpense = (id, data) =>
  api.put(`/api/expenses/${id}`, data).then(r => r.data);

export const deleteExpense = (id) =>
  api.delete(`/api/expenses/${id}`).then(r => r.data);
