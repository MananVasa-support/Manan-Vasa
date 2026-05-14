# Manan Vasa - Business Transformation Architect & Professional Ecosystem

This repository contains the professional portfolio and a comprehensive suite of business management tools for **CA Manan Vasa**, Founder of **Altus Corp**. The project serves as a central hub for his professional branding and the internal operations of his consultancy practice.

## 🚀 Overview

The ecosystem is designed to bridge the gap between business strategy and execution, providing tools for founders to scale their businesses through system-led order rather than just increased effort.

## 📂 Project Components

### 1. Main Portfolio ([index.html](index.html))
The flagship landing page for `mananvasa.com`. It details Manan Vasa's 21-year journey, his life philosophy, the **TFCR Model©** (Time, Focus, Clarity, Reality), and documented results across 200+ industries.

### 2. Attendance Dashboard ([/attendance](attendance/index.html))
A real-time tracking system for employee attendance.
- **Daily Log**: Monitors "In Time" and "Out Time" with status indicators (On Time, Late, Half Day, Absent).
- **Monthly Summary**: Provides analytics on working days, holidays, and average working hours per employee.

### 3. Work Management Dashboard ([/work](work/index.html))
A data-driven task management interface.
- **Task Status**: Tracking by "Doer" and "Initiator".
- **Aging Analytics**: Visualizes pending tasks by due date using aging buckets (e.g., 0-3 days, 60+ days).
- **Visual Distribution**: Status distribution charts powered by Chart.js.

### 4. Incentive Dashboard ([/incentive](incentive/index.html))
A performance intelligence tool for tracking incentives.
- **YTD Analytics**: Consolidated view of permanent and project-based incentives.
- **Leaderboard**: Rank-based performance tracking.
- **Sidebar Integration**: Detailed drill-down for specific employees or incentive types.

### 5. Altus Corp Ecosystem ([/ecosystem](ecosystem/index.html))
A unified interface for company-wide operations. It consolidates multiple forms into one dynamic app:
- Assign Work & Projects
- Leave Applications
- Reimbursement Claims
- Record Reference Tracking
- Participant Breakthroughs

### 6. Ecosystem Index ([/ecosystem index](ecosystem%20index/index.html))
The "Command Center" providing a central directory of links to all internal Google Sheets, folders, and manuals used by Manan Vasa, Employees, Sales, and Accounts teams.

### 7. Social Bio-Link ([/social](social/index.html))
A mobile-optimized landing page for social media platforms, providing quick access to Manan's practice doors, profile, and contact details.

## 🛠 Tech Stack

- **Frontend**: HTML5, CSS3 (Modern responsive layouts), Vanilla JavaScript.
- **Data Visualization**: [Chart.js](https://www.chartjs.org/) for dashboards.
- **Backend/Data Management**: Integrated with **Google Apps Script** and **Google Sheets** for real-time data storage and retrieval.
- **Icons**: SVG-based iconography.

## 📁 Repository Structure

```text
.
├── attendance/          # Attendance Dashboard
├── ecosystem/           # Unified Operations Form
├── ecosystem index/     # Central Resource Hub
├── incentive/           # Performance Incentive Analytics
├── social/              # Bio-link Page
├── work/                # Task Management Dashboard
├── index.html           # Main Portfolio Landing Page
├── CNAME                # Custom Domain Configuration (mananvasa.com)
└── site.webmanifest    # Web App Manifest
```

## 📋 Maintenance

- **Data Sources**: Most dashboards fetch data via JSONP or Fetch API from Google Apps Script URLs defined in the respective `index.html` files.
- **Assets**: Images and favicons are stored in the root and subdirectories (`/socials`, `/ecosystem`).
