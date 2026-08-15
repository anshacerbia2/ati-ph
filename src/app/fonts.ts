import { Plus_Jakarta_Sans, Poppins, Urbanist } from "next/font/google";

export const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

export const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export const urbanist = Urbanist({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-urbanist",
  display: "swap",
});

export const fontVariables = [
  poppins.variable,
  plusJakartaSans.variable,
  urbanist.variable,
].join(" ");
