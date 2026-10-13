import { handleAnnouncements } from '../announcements.js';

export default function handler(request, response) { return handleAnnouncements(request, response, true); }
