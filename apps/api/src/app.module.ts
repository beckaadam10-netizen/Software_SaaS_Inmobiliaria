import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AdminController } from './admin/admin.controller.js';
import { AccountingController } from './accounting/accounting.controller.js';
import { AccountingService } from './accounting/accounting.service.js';
import { BankController } from './bank/bank.controller.js';
import { CompanyController } from './company/company.controller.js';
import { IntegrationsController } from './integrations/integrations.controller.js';
import { ApiKeyGuard, V1Controller } from './integrations/v1.controller.js';
import { WebhooksService } from './integrations/webhooks.service.js';
import { InvoicesController } from './invoicing/invoices.controller.js';
import { BranchesController } from './branches/branches.controller.js';
import { CompareController } from './compare/compare.controller.js';
import { LegalController } from './legal/legal.controller.js';
import { SearchController } from './search/search.controller.js';
import { TaxController } from './tax/tax.controller.js';
import { AiController } from './ai/ai.controller.js';
import { AiService } from './ai/ai.service.js';
import { AutomationsController } from './automations/automations.controller.js';
import { AutomationsService } from './automations/automations.service.js';
import { InsightsController } from './insights/insights.controller.js';
import { SnapshotService } from './insights/snapshot.service.js';
import { OwnerController } from './owner/owner.controller.js';
import { TasksController } from './tasks/tasks.controller.js';
import { AuditController } from './audit/audit.controller.js';
import { AuditInterceptor } from './audit/audit.interceptor.js';
import { AuthModule } from './auth/auth.module.js';
import { CasesController } from './cases/cases.controller.js';
import { CasesService } from './cases/cases.service.js';
import { CommonModule } from './common/common.module.js';
import { ErrorsFilter } from './common/errors.filter.js';
import { ContactsController } from './contacts/contacts.controller.js';
import { DashboardController } from './dashboard/dashboard.controller.js';
import { DocumentsController } from './documents/documents.controller.js';
import { MarketingController } from './marketing/marketing.controller.js';
import { MatchingController } from './matching/matching.controller.js';
import { NegotiationsController } from './negotiations/negotiations.controller.js';
import { NotificationsController } from './notifications/notifications.controller.js';
import { NotificationsService } from './notifications/notifications.service.js';
import { PostSaleController } from './postsale/postsale.controller.js';
import { WhatsappController } from './whatsapp/whatsapp.controller.js';
import { FinanceController } from './finance/finance.controller.js';
import { FinanceService } from './finance/finance.service.js';
import { HealthController } from './health/health.controller.js';
import { LeadsController } from './leads/leads.controller.js';
import { LeadsService } from './leads/leads.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PropertiesController } from './properties/properties.controller.js';
import { PublicController } from './public/public.controller.js';
import { ReportsController } from './reports/reports.controller.js';
import { TenantMiddleware } from './tenants/tenant.middleware.js';
import { UsersController } from './users/users.controller.js';
import { CaptationController } from './captation/captation.controller.js';
import { AvatarController } from './users/avatar.controller.js';
import { VisitsController } from './visits/visits.controller.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, CommonModule, AuthModule],
  controllers: [
    HealthController, AdminController, UsersController, AvatarController, CaptationController, ContactsController, PropertiesController,
    LeadsController, VisitsController, CasesController, DashboardController, PublicController, AuditController,
    NegotiationsController, DocumentsController, PostSaleController, MatchingController, MarketingController,
    WhatsappController, NotificationsController, FinanceController, ReportsController,
    InsightsController, AiController, TasksController, AutomationsController, OwnerController,
    CompanyController, IntegrationsController, V1Controller, AccountingController, InvoicesController, BankController,
    BranchesController, SearchController, CompareController, TaxController, LegalController,
  ],
  providers: [
    CasesService,
    LeadsService,
    NotificationsService,
    FinanceService,
    SnapshotService,
    AiService,
    AutomationsService,
    WebhooksService,
    ApiKeyGuard,
    AccountingService,
    { provide: APP_FILTER, useClass: ErrorsFilter },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Toda petición pasa primero por la resolución de empresa.
    consumer.apply(TenantMiddleware).forRoutes('*path');
  }
}
