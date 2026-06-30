import { Link } from "wouter";
import { FishTokriLogo } from "@/components/storefront/FishTokriLogo";

import instaIcon from "@assets/instagram_(5)_1778180430452.png";
import fbIcon from "@assets/facebook_(5)_1778180449916.png";
import ytIcon from "@assets/youtube_(2)_1778180468466.png";
import waIcon from "@assets/logo_(14)_1778180502395.png";

import pinIcon from "@assets/pin_(1)_1778180652425.png";
import phoneIcon from "@assets/telephone_1778180674008.png";
import mailIcon from "@assets/email_1778180701088.png";
import clockIcon from "@assets/clock_(1)_1778180727425.png";

const whiteFilter = { filter: "brightness(0) invert(1)" } as const;

export function Footer() {
  return (
    <footer className="bg-[#364F9F] text-white mt-12">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-10 pb-6">

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.1fr_0.85fr_0.85fr_1.15fr_1.4fr] gap-x-5 gap-y-8 mb-8">

          {/* Brand Column */}
          <div className="sm:col-span-2 lg:col-span-1">
            <FishTokriLogo className="h-9 w-auto mb-4 brightness-0 invert" />
            <p className="text-white text-sm leading-relaxed mb-5">
              Thane's freshest fish, seafood & meat, cleaned, packed, and delivered straight to your doorstep.
            </p>
            <div className="flex items-center gap-3">
              <a href="https://www.instagram.com/fishtokri/" target="_blank" rel="noreferrer" aria-label="Instagram"
                className="w-10 h-10 flex-shrink-0 rounded-xl overflow-hidden transition-all duration-200 hover:scale-110 hover:opacity-90">
                <img src={instaIcon} alt="Instagram" className="w-10 h-10 object-cover" />
              </a>
              <a href="https://www.facebook.com/fishtokri/" target="_blank" rel="noreferrer" aria-label="Facebook"
                className="w-10 h-10 flex-shrink-0 rounded-xl overflow-hidden transition-all duration-200 hover:scale-110 hover:opacity-90">
                <img src={fbIcon} alt="Facebook" className="w-10 h-10 object-contain" />
              </a>
              <a href="https://wa.me/9220200100" target="_blank" rel="noreferrer" aria-label="WhatsApp"
                className="w-10 h-10 flex-shrink-0 rounded-xl overflow-hidden transition-all duration-200 hover:scale-110 hover:opacity-90">
                <img src={waIcon} alt="WhatsApp" className="w-10 h-10 object-cover" />
              </a>
              <a href="https://youtube.com" target="_blank" rel="noreferrer" aria-label="YouTube"
                className="w-10 h-10 flex-shrink-0 rounded-xl overflow-hidden transition-all duration-200 hover:scale-110 hover:opacity-90">
                <img src={ytIcon} alt="YouTube" className="w-10 h-10 object-cover" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold text-white text-sm uppercase tracking-widest mb-4">
              Quick Links
            </h4>
            <ul className="space-y-2.5">
              {[
                { label: "Home", href: "/" },
                { label: "Shop Fish", href: "/category/Fish" },
                { label: "Shop Prawns", href: "/category/Prawns" },
                { label: "Shop Chicken", href: "/category/Chicken" },
                { label: "Shop Mutton", href: "/category/Mutton" },
                { label: "Combo Deals", href: "/combos" },
              ].map(({ label, href }) => (
                <li key={label}>
                  <Link href={href} className="text-white text-sm hover:opacity-75 transition-opacity">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Customer Support */}
          <div>
            <h4 className="font-semibold text-white text-sm uppercase tracking-widest mb-4">
              Customer Support
            </h4>
            <ul className="space-y-2.5">
              {[
                { label: "My Orders", href: "/profile" },
                { label: "My Profile", href: "/profile" },
                { label: "Terms & Conditions", href: "#" },
                { label: "Privacy Policy", href: "#" },
                { label: "Refund Policy", href: "#" },
                { label: "FAQ", href: "#" },
              ].map(({ label, href }) => (
                <li key={label}>
                  <a href={href} className="text-white text-sm hover:opacity-75 transition-opacity">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h4 className="font-semibold text-white text-sm uppercase tracking-widest mb-4">
              Contact Us
            </h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-2.5">
                <img src={phoneIcon} alt="" aria-hidden className="w-4 h-4 shrink-0" style={whiteFilter} />
                <a href="tel:+919220200100" className="text-white text-sm hover:opacity-75 transition-opacity">
                  +91 92202 00100
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <img src={mailIcon} alt="" aria-hidden className="w-4 h-4 shrink-0" style={whiteFilter} />
                <a href="mailto:info@fishtokri.com" className="text-white text-sm hover:opacity-75 transition-opacity">
                  info@fishtokri.com
                </a>
              </li>
              <li className="flex items-start gap-2.5">
                <img src={clockIcon} alt="" aria-hidden className="w-4 h-4 shrink-0 mt-0.5" style={whiteFilter} />
                <span className="text-white text-sm leading-snug">
                  Mon – Sun: 6:00 AM – 9:00 PM
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="text-white text-sm font-medium">GSTIN:</span>
                <span className="text-white text-sm font-medium tracking-wide">27AAOCA7628P1ZT</span>
              </li>
            </ul>
          </div>

          {/* Map Column */}
          <div className="flex flex-col">
            <h4 className="font-semibold text-white text-sm uppercase tracking-widest mb-4 opacity-0 select-none hidden lg:block">
              Map
            </h4>
            <div className="rounded-xl overflow-hidden border border-white/20 w-full flex-1" style={{ minHeight: "200px" }}>
              <iframe
                title="FishTokri Location"
                src="https://maps.google.com/maps?q=Shiva+Nand+Society+Jambli+Naka+Khartan+Road+Thane+West+Thane+400601+Maharashtra&output=embed"
                width="100%"
                height="100%"
                style={{ border: 0, minHeight: "200px" }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>

        </div>

        {/* Divider + bottom bar */}
        <div className="border-t border-white/20 pt-5 flex flex-col sm:grid sm:grid-cols-3 sm:items-center gap-1.5 sm:gap-0">
          <p className="text-white text-sm text-center sm:text-left order-2 sm:order-1">
            © {new Date().getFullYear()} FishTokri. All rights reserved.
          </p>
          <p className="text-white text-sm font-normal text-center order-1 sm:order-2">
            Designed and Developed by{" "}
            <a
              href="https://www.airavatatechnologies.com/"
              target="_blank"
              rel="noreferrer"
              className="text-white hover:opacity-75 transition-opacity font-medium"
              style={{ textDecoration: "none" }}
            >
              AIRAVATA TECHNOLOGIES
            </a>
          </p>
          <div className="hidden sm:block order-3" />
        </div>

      </div>
    </footer>
  );
}
