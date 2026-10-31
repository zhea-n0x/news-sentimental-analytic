// Articles are Indonesian news, so times are shown in WIB (Asia/Jakarta).
const date = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Jakarta',
});
const dateTime = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Jakarta',
});

export const formatDate = (iso: string) => date.format(new Date(iso));
export const formatDateTime = (iso: string) => `${dateTime.format(new Date(iso))} WIB`;
