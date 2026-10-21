export function bookingNotification(kind: string, reference: string, demo = false) {
  const content = kind === 'taxis'
    ? { title: 'Seats reserved', body: 'Your taxi seat booking is confirmed.', url: '/account#bookings' }
    : kind === 'trailers'
      ? { title: 'Trailer reservation requested', body: 'Your rental request was submitted. Provider confirmation is still required.', url: '/account#reservations' }
      : kind === 'products' || kind === 'livestock'
        ? { title: 'Order placed', body: 'Your farm market order has been placed successfully.', url: '/account#orders' }
        : null;
  if (!content || !reference) return null;
  return { ...content, title: `${demo ? 'Demo · ' : ''}${content.title}`, body: `${demo ? 'Saved in this browser only. No real provider is involved.' : content.body} Reference: ${reference}`, tag: `omyquant-created-${reference}` };
}
