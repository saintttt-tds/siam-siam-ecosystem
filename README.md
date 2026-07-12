# SiamSiam Ecosystem 🚀

<div align="center">

![SiamSiam Logo](docs/assets/logo.png)

**Pan-African Super App Platform**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D8.0.0-orange.svg)](https://pnpm.io)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

## 📖 Overview

SiamSiam is a comprehensive pan-African super app ecosystem providing:

- 🛒 **Axion Commerce** - B2B2C Marketplace
- 💰 **AxionPay** - Digital Wallet & Payments
- 🚁 **AxionFly** - Delivery & Logistics (including drone delivery!)
- 🏪 **AxionPOS** - Point of Sale System
- 📱 **USSD Gateway** - *123# style mobile banking
- 💱 **Corporate FX** - Foreign Exchange Trading
- 🔌 **Developer Portal** - API Platform
- 🤖 **AI/ML Service** - Intelligent features

## 🏗️ Architecture



## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** >= 8.0.0
- **Docker** & Docker Compose (for local development)
- **PostgreSQL** 15+
- **Redis** 7+
- **RabbitMQ** 3.12+

### Development Setup

```bash
# 1. Clone the repository
git clone https://github.com/siamsiam/siamsiam-ecosystem.git
cd siamsiam-ecosystem

# 2. Install dependencies
make install

# 3. Copy environment configuration
cp config/.env.example config/.env.dev
# Edit config/.env.dev with your local settings

# 4. Start infrastructure (PostgreSQL, Redis, RabbitMQ)
make docker-dev

# 5. Run database migrations and seeds
make db-reset

# 6. Start development servers
make dev




Environment Configuration
⚠️ IMPORTANT: Never commit real credentials!

Copy config/.env.example to config/.env.dev

Update the following placeholders:

DB_PASSWORD - Your local PostgreSQL password

REDIS_PASSWORD - Your Redis password (if any)

JWT_ACCESS_SECRET - A secure random string for JWT signing

ENCRYPTION_KEY - A 32-character encryption key

Available Services
Service	Port	Description
API Gateway	3000	Main entry point
Auth Service	3001	Authentication & authorization
Payment Service	3002	Payment processing
Commerce Service	3003	Marketplace backend
Delivery Service	3004	Delivery orchestration
Notification Platform	3005	Multi-channel notifications
USSD Gateway	3006	USSD service
Corporate FX	3007	FX trading platform
AI Service	5000	AI/ML service (Python)
📁 Project Structure
text
siamsiam-ecosystem/
├── packages/              # Shared internal packages
│   ├── shared-utils/      # Common utilities
│   ├── shared-models/     # Database models
│   ├── shared-middleware/ # Express middleware
│   └── shared-config/     # Shared configurations
├── services/              # Core microservices
│   ├── api-gateway/
│   ├── auth-service/
│   ├── payment-service/
│   └── ...
├── applications/          # Business applications
│   ├── axion-commerce/
│   ├── axionpay/
│   └── axionfly/
├── frontend/              # Web application
├── mobile/                # Mobile apps
├── infrastructure/        # DevOps & infrastructure
└── docs/                  # Documentation
🔧 Technology Stack
Backend
Runtime: Node.js 18+

Framework: Express.js / Fastify

Language: JavaScript (ES2022+)

Database: PostgreSQL 15

Cache: Redis 7

Message Queue: RabbitMQ 3.12

AI/ML: Python 3.11 (FastAPI)

Frontend
Framework: React 18

Build Tool: Vite

State Management: Redux Toolkit / Zustand

Mobile
Framework: Kotlin Multiplatform Mobile (KMM)

Platforms: Android, iOS

DevOps
Container: Docker

Orchestration: Kubernetes

CI/CD: GitHub Actions

Monitoring: Prometheus + Grafana

Logging: ELK Stack (Elasticsearch, Logstash, Kibana)

📚 Documentation
Architecture Overview

API Documentation

Developer Guide

Deployment Guide

Security Guidelines

🔒 Security
PCI-DSS compliant payment processing

AES-256 encryption for data at rest

JWT-based authentication with RS256

Multi-factor authentication support

Rate limiting and DDoS protection

Regular security audits

🤝 Contributing
Please read CONTRIBUTING.md for details on our code of conduct and the process for submitting pull requests.

📄 License
This project is licensed under the MIT License - see the LICENSE file for details.

📧 Contact
Engineering Team: engineering@siamsiam.com

API Support: api-support@siamsiam.com

Security: security@siamsiam.com

<div align="center"> <sub>Built with ❤️ by the SiamSiam Engineering Team</sub> </div> ```