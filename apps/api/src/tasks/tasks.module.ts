import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { WorkflowService } from './workflow.service';
import { CreateTaskService } from './create-task.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, WorkflowService, CreateTaskService],
})
export class TasksModule {}
