"use client";

import { EntityCrudTable } from "@/components/domain/entity-crud-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const CODE_NAME_FIELDS = [
  { name: "code", label: "Mã" },
  { name: "name", label: "Tên" },
];

export default function MasterDataPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Team & địa điểm</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Master data dùng chung mọi kỳ. Tắt một team sẽ ẩn khỏi form đăng ký.
        </p>
      </div>
      <Tabs defaultValue="teams">
        <TabsList>
          <TabsTrigger value="teams">Team / Bộ phận</TabsTrigger>
          <TabsTrigger value="sites">Địa điểm làm việc</TabsTrigger>
        </TabsList>
        <TabsContent value="teams">
          <EntityCrudTable
            queryKey={["teams"]}
            label="Team"
            basePath="/api/teams"
            fields={CODE_NAME_FIELDS}
          />
        </TabsContent>
        <TabsContent value="sites">
          <EntityCrudTable
            queryKey={["sites"]}
            label="Địa điểm"
            basePath="/api/sites"
            fields={CODE_NAME_FIELDS}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
