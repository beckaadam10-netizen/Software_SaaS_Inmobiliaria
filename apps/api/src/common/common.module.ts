import { Global, Module } from '@nestjs/common';
import { ActivityService } from './activity.service.js';
import { AuditService } from './audit.service.js';
import { LimitsService } from './limits.service.js';
import { RefsService } from './refs.service.js';

@Global()
@Module({
  providers: [ActivityService, AuditService, LimitsService, RefsService],
  exports: [ActivityService, AuditService, LimitsService, RefsService],
})
export class CommonModule {}
