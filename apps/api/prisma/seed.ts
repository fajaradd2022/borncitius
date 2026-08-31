/**
 * Seed data awal — cerminan dari apps/web-admin/src/lib/mock-data.ts supaya
 * dashboard yang sudah ada punya padanan nyata di database.
 *
 * Idempoten: dijalankan berulang tidak menggandakan data.
 */
import { PrismaClient, type FieldType } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Di produksi, password default hardcode tidak boleh pernah terpasang ke
// akun sungguhan (termasuk admin) — wajib set SEED_PASSWORD eksplisit. Di
// dev/lokal tetap boleh fallback demi kenyamanan `prisma db seed` cepat.
if (process.env.NODE_ENV === 'production' && !process.env.SEED_PASSWORD) {
  throw new Error(
    'SEED_PASSWORD wajib diset saat NODE_ENV=production — seed dibatalkan supaya tidak memasang password default yang diketahui publik ke akun sungguhan.',
  );
}

const DEFAULT_PASSWORD = process.env.SEED_PASSWORD ?? 'BornCitius#2026';

interface FieldSeed {
  label: string;
  fieldType: FieldType;
  isRequired: boolean;
  section: string;
  options?: string[];
}

async function main(): Promise<void> {
  const passwordHash = await argon2.hash(DEFAULT_PASSWORD);

  const users = await Promise.all(
    [
      { email: 'itopscitius@gmail.com', name: 'Fajar Admin', role: 'admin' as const },
      { email: 'dian.spv@borncitius.id', name: 'Dian Supervisor', role: 'spv' as const },
      { email: 'rizky@borncitius.id', name: 'Rizky Pratama', role: 'teknisi' as const },
      { email: 'agus@borncitius.id', name: 'Agus Setiawan', role: 'teknisi' as const },
      { email: 'budi@borncitius.id', name: 'Budi Santoso', role: 'teknisi' as const, isActive: false },
    ].map((u) =>
      prisma.user.upsert({
        where: { email: u.email },
        update: {},
        create: { ...u, passwordHash, isActive: u.isActive ?? true },
      }),
    ),
  );

  const [admin, spv, rizky, agus] = users;

  const templateSeeds: Array<{ name: string; description: string; version: number; fields: FieldSeed[] }> = [
    {
      name: 'UAT Instalasi Fiber',
      description: 'Form User Acceptance Test untuk instalasi jaringan fiber pelanggan baru.',
      version: 3,
      fields: [
        { label: 'Informasi Pelanggan', fieldType: 'section', isRequired: false, section: 'Info Umum' },
        { label: 'Nama Pelanggan', fieldType: 'text', isRequired: true, section: 'Info Umum' },
        { label: 'Nomor Kontrak', fieldType: 'text', isRequired: true, section: 'Info Umum' },
        { label: 'Tanggal Instalasi', fieldType: 'date', isRequired: true, section: 'Info Umum' },
        { label: 'Lokasi ODP', fieldType: 'gps', isRequired: true, section: 'Info Umum' },
        { label: 'Detail Teknis', fieldType: 'section', isRequired: false, section: 'Detail Teknis' },
        { label: 'Redaman (dBm)', fieldType: 'number', isRequired: true, section: 'Detail Teknis' },
        {
          label: 'Tipe ONT Terpasang',
          fieldType: 'dropdown',
          isRequired: true,
          section: 'Detail Teknis',
          options: ['HG8145V5', 'HG8245H5', 'F670L'],
        },
        { label: 'Foto Perangkat Terpasang', fieldType: 'photo', isRequired: true, section: 'Detail Teknis' },
        { label: 'Foto Hasil Speedtest', fieldType: 'photo', isRequired: true, section: 'Detail Teknis' },
        { label: 'Catatan Teknisi', fieldType: 'textarea', isRequired: false, section: 'Detail Teknis' },
        { label: 'Serah Terima', fieldType: 'section', isRequired: false, section: 'Serah Terima' },
        {
          label: 'Dokumen BAST Tertandatangani',
          fieldType: 'signed_document',
          isRequired: true,
          section: 'Serah Terima',
        },
      ],
    },
    {
      name: 'UAT Instalasi SD-WAN Retail',
      description:
        'Instalasi SD-WAN di store retail: upload scan BA+UAT bertanda tangan + dokumentasi foto per perangkat.',
      version: 1,
      fields: [
        { label: 'Data Store', fieldType: 'section', isRequired: false, section: 'Data Store' },
        { label: 'Nama Store', fieldType: 'text', isRequired: true, section: 'Data Store' },
        { label: 'Kode Store', fieldType: 'text', isRequired: true, section: 'Data Store' },
        { label: 'Tanggal Instalasi', fieldType: 'date', isRequired: true, section: 'Data Store' },
        { label: 'Jumlah Perangkat Terpasang', fieldType: 'number', isRequired: false, section: 'Data Store' },
        { label: 'Lokasi Store', fieldType: 'gps', isRequired: true, section: 'Data Store' },
        {
          label: 'Dokumen BA + UAT Tertandatangani (scan)',
          fieldType: 'signed_document',
          isRequired: true,
          section: 'Data Store',
        },
        { label: 'Dokumentasi Perangkat', fieldType: 'section', isRequired: false, section: 'Dokumentasi Perangkat' },
        {
          label: 'Posisi Perangkat Fortigate FG40F',
          fieldType: 'photo',
          isRequired: true,
          section: 'Dokumentasi Perangkat',
        },
        { label: 'Posisi Perangkat RUT200', fieldType: 'photo', isRequired: true, section: 'Dokumentasi Perangkat' },
        { label: 'SN Fortigate', fieldType: 'photo', isRequired: true, section: 'Dokumentasi Perangkat' },
        { label: 'Stiker Perangkat', fieldType: 'photo', isRequired: true, section: 'Dokumentasi Perangkat' },
        { label: 'Hasil Uji', fieldType: 'section', isRequired: false, section: 'Hasil Uji' },
        { label: 'Test Ping portal.sat.co.id', fieldType: 'photo', isRequired: true, section: 'Hasil Uji' },
        { label: 'Test Failover', fieldType: 'photo', isRequired: true, section: 'Hasil Uji' },
        { label: 'Catatan Teknisi', fieldType: 'textarea', isRequired: false, section: 'Hasil Uji' },
      ],
    },
  ];

  const templates = [];
  for (const t of templateSeeds) {
    const existing = await prisma.taskTemplate.findFirst({ where: { name: t.name } });
    if (existing) {
      templates.push(await prisma.taskTemplate.findUniqueOrThrow({
        where: { id: existing.id },
        include: { fields: { orderBy: { orderIndex: 'asc' } } },
      }));
      continue;
    }
    const created = await prisma.taskTemplate.create({
      data: {
        name: t.name,
        description: t.description,
        version: t.version,
        createdBy: admin.id,
        fields: {
          create: t.fields.map((f, i) => ({
            label: f.label,
            fieldType: f.fieldType,
            isRequired: f.isRequired,
            section: f.section,
            orderIndex: i,
            options: f.options ?? undefined,
          })),
        },
      },
      include: { fields: { orderBy: { orderIndex: 'asc' } } },
    });
    templates.push(created);
  }

  const [uatTemplate, sdwanTemplate] = templates;

  const folderSeeds = [
    { name: 'UAT PT MTM', clientName: 'PT Mitra Telekomunikasi Mandiri', reviewer: spv.id },
    { name: 'Task Last BAR - Region Jabodetabek', clientName: 'Internal', reviewer: admin.id },
    { name: 'Rollout SD-WAN Alfamart', clientName: 'PT Sumber Alfaria Trijaya Tbk.', reviewer: spv.id },
  ];

  const folders = [];
  for (const f of folderSeeds) {
    const existing = await prisma.folder.findFirst({ where: { name: f.name } });
    folders.push(
      existing ??
        (await prisma.folder.create({
          data: {
            name: f.name,
            clientName: f.clientName,
            defaultReviewerId: f.reviewer,
            createdBy: admin.id,
          },
        })),
    );
  }

  const [folderMtm, , folderAlfamart] = folders;

  const taskSeeds = [
    { folder: folderMtm, template: uatTemplate, teknisi: rizky.id, siteId: 'MTM-JKT-001', status: 'submitted' as const },
    { folder: folderMtm, template: uatTemplate, teknisi: agus.id, siteId: 'MTM-JKT-002', status: 'assigned' as const },
    {
      folder: folderAlfamart,
      template: sdwanTemplate,
      teknisi: rizky.id,
      siteId: 'R881-CAMMING-BONE',
      status: 'assigned' as const,
    },
  ];

  for (const t of taskSeeds) {
    const existing = await prisma.taskInstance.findFirst({
      where: { folderId: t.folder.id, siteId: t.siteId },
    });
    if (existing) continue;

    await prisma.taskInstance.create({
      data: {
        folderId: t.folder.id,
        templateId: t.template.id,
        templateVersionSnapshot: t.template.version,
        assignedTeknisiId: t.teknisi,
        siteId: t.siteId,
        status: t.status,
        dueDate: new Date(Date.now() + 7 * 86_400_000),
        fields: {
          create: t.template.fields.map((f) => ({
            fieldKey: f.id,
            label: f.label,
            fieldType: f.fieldType,
            options: f.options ?? undefined,
            isRequired: f.isRequired,
            section: f.section,
            orderIndex: f.orderIndex,
          })),
        },
      },
    });
  }

  const counts = {
    users: await prisma.user.count(),
    templates: await prisma.taskTemplate.count(),
    folders: await prisma.folder.count(),
    tasks: await prisma.taskInstance.count(),
    fields: await prisma.taskInstanceField.count(),
  };
  console.log('Seed selesai:', counts);
  console.log(`Password semua user seed: ${DEFAULT_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
