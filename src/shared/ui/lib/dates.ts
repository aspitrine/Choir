// Rendered both on the server (UTC) and in the browser: without an explicit time
// zone the two disagree (wrong time in the HTML, hydration mismatch). Choirs
// using the app are French, so event times are shown in Paris time.
export const APP_TIME_ZONE = 'Europe/Paris'

const eventDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: APP_TIME_ZONE,
})

export function formatEventDate(date: Date | string) {
  return eventDateFormatter.format(new Date(date))
}
