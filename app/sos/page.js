import { redirect } from 'next/navigation';

// /sos → redirects to home (which is now the SOS form)
export default function SOSPage() {
  redirect('/');
}