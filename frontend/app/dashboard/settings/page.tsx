"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileSettings } from "./profile-settings";
import { NotificationSettings } from "./notification-settings";
import { PaymentHistory } from "./payment-history";
import { ConsentSettings } from "./consent-settings";
import { AccountDeletion } from "./account-deletion";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">설정</h1>
      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="profile">프로필</TabsTrigger>
          <TabsTrigger value="notifications">알림</TabsTrigger>
          <TabsTrigger value="payments">결제 내역</TabsTrigger>
          <TabsTrigger value="consent">동의 관리</TabsTrigger>
          <TabsTrigger value="account">계정</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <ProfileSettings />
        </TabsContent>

        <TabsContent value="payments" className="mt-6">
          <PaymentHistory />
        </TabsContent>

        <TabsContent value="notifications" className="mt-6">
          <NotificationSettings />
        </TabsContent>

        <TabsContent value="consent" className="mt-6">
          <ConsentSettings />
        </TabsContent>

        <TabsContent value="account" className="mt-6">
          <AccountDeletion />
        </TabsContent>
      </Tabs>
    </div>
  );
}
