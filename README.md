# VendorBridge

## Procurement Intelligence & Vendor Management Platform

VendorBridge is a full-stack procurement management platform designed to digitize and streamline the vendor procurement lifecycle.

Built during a hackathon, the platform replaces fragmented procurement processes involving emails, spreadsheets, and manual approvals with a centralized system that enables vendor management, quotation comparison, approval workflows, analytics, and audit tracking.

---

## Overview

Procurement operations in many organizations still rely on disconnected tools and manual communication channels. This often results in:

* Delayed procurement cycles
* Lack of transparency
* Inefficient vendor evaluation
* Compliance challenges
* Missing audit trails
* Poor visibility into spending patterns

VendorBridge addresses these challenges through a unified procurement workflow that improves transparency, accountability, and operational efficiency.

---

## Key Features

### Vendor Management

* Vendor onboarding and registration
* Vendor profile management
* Status tracking and filtering
* Supplier database maintenance

### Request for Quotation (RFQ)

* Create and manage RFQs
* Dynamic line-item support
* Requirement specification management
* RFQ lifecycle tracking

### Quotation Evaluation

* Side-by-side vendor comparison
* Automated cost calculations
* Tax and pricing analysis
* Procurement decision support

### Approval Workflow

* Multi-stage approval pipeline
* Review and authorization tracking
* Approval history and remarks
* Procurement governance support

### Purchase Order Management

* Purchase order generation
* Procurement progress tracking
* Order lifecycle visibility

### Analytics Dashboard

* Procurement spending insights
* Vendor performance monitoring
* Trend analysis and reporting
* Data visualization using charts

### Audit Logging

* Activity tracking across the platform
* Procurement traceability
* Compliance-oriented audit records
* Tamper-resistant logging architecture

---

## Technology Stack

| Layer              | Technologies            |
| ------------------ | ----------------------- |
| Frontend           | HTML5, CSS3, JavaScript |
| Backend            | Supabase                |
| Database           | PostgreSQL              |
| Data Visualization | Chart.js                |
| Version Control    | Git, GitHub             |

---

## System Architecture

```
User Interface
      │
      ▼
Frontend (HTML, CSS, JavaScript)
      │
      ▼
Supabase Backend Services
      │
      ├── Authentication
      ├── Database Operations
      ├── Audit Logging
      └── Data Storage
      │
      ▼
PostgreSQL Database
```

---

## Core Procurement Workflow

```
Vendor Registration
        ↓
RFQ Creation
        ↓
Quotation Submission
        ↓
Quotation Comparison
        ↓
Approval Process
        ↓
Purchase Order Generation
        ↓
Audit Logging
        ↓
Analytics & Reporting
```

---

## Project Structure

```text
vendorbridge/
│
├── index.html
├── dashboard.html
├── vendors.html
├── rfqs.html
├── quotations.html
├── approvals.html
├── purchase_orders.html
├── activity.html
├── report.html
├── app.js
├── styles.css
├── schema.sql
└── README.md
```

---

## Installation

### Clone the Repository

```bash
git clone https://github.com/nirjala7-11/VendorBridge.git
cd VendorBridge
```

### Configure Supabase

1. Create a Supabase project
2. Execute the SQL schema
3. Obtain the Project URL and API Key
4. Update configuration values in the application

### Run the Application

```bash
npx serve .
```

or launch directly through a local development server.

---

## Learning Outcomes

This project provided hands-on experience in:

* Full Stack Application Development
* Database Design and Modeling
* Procurement Workflow Engineering
* PostgreSQL and Supabase Integration
* Dashboard and Analytics Development
* Frontend Architecture
* Security-Oriented Design
* Version Control using Git and GitHub

---

## Challenges Solved

* Designing a procurement workflow from business requirements
* Structuring procurement-related database entities
* Building approval-driven workflows
* Implementing audit logging mechanisms
* Presenting procurement analytics in a meaningful way
* Managing multiple interconnected modules within a single platform

---

## Future Enhancements

* Role-Based Access Control (RBAC)
* Email Notifications
* Vendor Self-Service Portal
* Mobile Responsive Experience
* PDF Purchase Order Generation
* Real-Time Collaboration Features
* Multi-Currency Support
* Advanced Procurement Analytics

### AI Integration Roadmap

* Vendor Risk Assessment
* Intelligent Supplier Recommendations
* Procurement Demand Forecasting
* Invoice Fraud Detection
* AI Procurement Assistant

---
## Live Link
https://nirjala7-11.github.io/VendorBridge/

## Youtube Submission Video Link
(https://youtu.be/UGBaS3FSmQE)

## Hackathon Submission

This project was developed as a hackathon solution to demonstrate how modern web technologies can improve procurement management through automation, transparency, and data-driven decision making.

---

## Author

### Nirjala Dixit

IT Engineering Student

* Full Stack Development Enthusiast
* Data Science Learner
* Open Source & Hackathon Participant

---

## Acknowledgements

Special thanks to the hackathon organizers, mentors, and the open-source community for providing tools and resources that made this project possible.
