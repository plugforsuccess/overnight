import { Moon } from 'lucide-react';
import Link from 'next/link';
import { APP_NAME } from '@/lib/constants';

export function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Moon className="h-5 w-5 text-night-400" />
              <span className="text-white font-bold">{APP_NAME}</span>
            </div>
            <p className="text-sm">
              Licensed Family Child Care Learning Home (FCCLH) providing safe overnight childcare in Georgia.
            </p>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3">Quick Links</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/pricing" className="hover:text-white">Pricing</Link></li>
              <li><Link href="/schedule" className="hover:text-white">Reserve Nights</Link></li>
              <li><Link href="/policies" className="hover:text-white">Policies & FAQ</Link></li>
              <li><Link href="/dashboard" className="hover:text-white">Parent Dashboard</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3">Contact</h4>
            <ul className="space-y-2 text-sm">
              <li>Georgia, USA</li>
              <li>Sunday – Thursday nights</li>
              <li>9:00 PM – 7:00 AM</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm">
          &copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
