import { Body, Controller, Delete, Get, Header, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import type {
  ImportBatch,
  ImportCommitResult,
  ImportPreview,
  Transaction,
  TransactionRevision,
} from '@dautu/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/current-user.decorator';
import { TEMPLATE_CSV } from './csv-import';
import { ImportDto } from './dto/import.dto';
import { ImportService } from './import.service';
import { TransactionDto } from './dto/transaction.dto';
import { TransactionsService } from './transactions.service';

/** Sổ giao dịch: ghi / sửa / huỷ giao dịch, lịch sử chỉnh sửa và nhập từ file CSV */
@UseGuards(JwtAuthGuard)
@Controller('portfolio')
export class TransactionsController {
  constructor(
    private transactions: TransactionsService,
    private imports: ImportService,
  ) {}

  @Get('transactions')
  listTransactions(@CurrentUser() user: AuthUser, @Query('portfolioId') portfolioId?: string): Promise<Transaction[]> {
    return this.transactions.list(user.id, portfolioId || undefined);
  }

  @Post('transactions')
  createTransaction(@CurrentUser() user: AuthUser, @Body() dto: TransactionDto): Promise<Transaction> {
    return this.transactions.create(user.id, dto);
  }

  @Put('transactions/:id')
  updateTransaction(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TransactionDto,
  ): Promise<Transaction> {
    return this.transactions.update(user.id, id, dto);
  }

  @Delete('transactions/:id')
  removeTransaction(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<Transaction> {
    return this.transactions.remove(user.id, id);
  }

  /** File CSV mẫu để nhập giao dịch */
  @Get('import/template')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="mau-giao-dich.csv"')
  importTemplate() {
    return `\uFEFF${TEMPLATE_CSV}`;
  }

  /** Xem trước file CSV: không ghi gì vào sổ */
  @Post('import/preview')
  importPreview(@CurrentUser() user: AuthUser, @Body() dto: ImportDto): Promise<ImportPreview> {
    return this.imports.preview(user.id, dto);
  }

  @Post('import/commit')
  importCommit(@CurrentUser() user: AuthUser, @Body() dto: ImportDto): Promise<ImportCommitResult> {
    return this.imports.commit(user.id, dto);
  }

  @Get('import/batches')
  importBatches(@CurrentUser() user: AuthUser): Promise<ImportBatch[]> {
    return this.transactions.importBatches(user.id);
  }

  @Post('import/batches/:id/undo')
  undoImport(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transactions.undoImport(user.id, id);
  }

  @Get('transactions/:id/revisions')
  revisions(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<TransactionRevision[]> {
    return this.transactions.revisions(user.id, id);
  }
}
