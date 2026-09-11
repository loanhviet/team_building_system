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
        <h1 className="text-2xl font-semibold">Master Data</h1>
        <p className="text-sm text-zinc-500">
          Danh sách Team và Địa điểm làm việc dùng chung cho mọi sự kiện.
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
