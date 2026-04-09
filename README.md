<div align="center">
  <img src="https://img.icons8.com/color/128/000000/meal.png" width="80" alt="ShareBite"/>
  <br/>
  <h1>ShareBite 🌍</h1>
  <strong>Zero Hunger. One Meal at a time.</strong>
  <br/><br/>
  
  <p>
    An end-to-end decentralized platform bridging the gap between excess food and empty plates. 
    ShareBite connects restaurants, hotels, and individuals who have surplus food directly with verified NGOs to rescue, redistribute, and eliminate food waste.
  </p>
  
  [![Live Demo](https://img.shields.io/badge/Live_Demo-sharebite--rescue.vercel.app-4ade80?style=for-the-badge&logo=vercel)](https://sharebite-rescue.vercel.app/)
  
  <br/>
</div>

---

## 🚀 The Problem & The Solution
Globally, **one-third of all food produced is wasted**, while millions go hungry. ShareBite is designed to provide an instant, frictionless communication channel between Donors and Rescue NGOs. 

When a donor has surplus food, they post a "Rescue". NGOs get alerted, claim the food, deliver it to communities in need, and upload photo proof. Every successful delivery earns the NGO Impact Points!

## 🌟 Key Features

* 🔐 **Role-Based Workflows**: Separate secure dashboards for Donors and NGOs.
* 📦 **Live Rescue Feed**: NGOs can instantly browse active food rescues with strict time-to-decay (expiry dates).
* ⏱️ **Auto-Decline Protocol**: Time limits enforce accountability. If an NGO claims food but fails to deliver within 30 minutes of expiry, they are auto-penalized.
* 📸 **Delivery Proofs**: Real photo-upload verification required for every successful drop-off.
* 🏆 **Impact Points Architecture**: Live leaderboard gamification to track performance of rescue organizations.
* 🌗 **Cinematic Dark Mode**: A sleek, accessible, modern UI optimized for all devices with advanced micro-animations.

## 🛠️ Technology Stack

* **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
* **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
* **Database & Auth**: [Supabase](https://supabase.com/) (PostgreSQL, Row Level Security, Storage Buckets)
* **Hosting**: [Vercel](https://vercel.com/)
* **UI Components**: Native HTML5, glassmorphism utilities, Lucide React Icons

## ⚙️ How it Works

1. **The Donor** opens their dashboard and posts available surplus food, selecting an expiry date and time.
2. **The NGO** browses the Rescue Feed and "Claims" the food.
3. The Donor sees a lock icon and clicks "Verify Pickup" when the NGO arrives.
4. The NGO delivers the food and uploads **Proof of Delivery** (an image).
5. The Donor verifies the image and clicks **Confirm Delivery**.
6. The NGO is instantly awarded **+1 Impact Point** 🏆!

## 💻 Local Development

Clone the project and start rescuing:

```bash
# 1. Clone repo
git clone https://github.com/The-Shreyas-M/sharebite.git
cd sharebite

# 2. Install dependencies
npm install

# 3. Setup Environment Variables
# Create a .env.local file in the root and add your Supabase credentials:
# NEXT_PUBLIC_SUPABASE_URL=your_url
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key

# 4. Start the frontend
npm run dev
```

---
<div align="center">
  <i>Built to eradicate food waste. Rescue food. Feed lives.</i>
</div>
