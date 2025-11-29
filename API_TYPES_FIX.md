# API Response Type Definitions

## Common Response Types

```typescript
// All API responses follow this pattern:
type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

// Subscription response
type SubscriptionData = {
  planId: number;
  planName: string;
  planDisplayName: string;
  planPrice: number;
  planCurrency: string;
  status: string;
  planLimits: {
    maxUsers: number;
    maxMessagesPerMonth?: number;
    maxIntegrations: number;
  };
};

// Plan response
type PlanData = {
  id: number;
  name: string;
  displayName: string;
  planType: string;
  price: number;
  currency: string;
  billingInterval: string;
  isActive: boolean;
  limits: {
    maxUsers: number;
    maxMessagesPerMonth?: number;
    maxIntegrations: number;
  };
};

// Module response
type ModuleData = {
  id: number;
  name: string;
  displayName: string;
  description: string;
  monthlyFee: number;
  includedUnits: number;
  overagePrice: number;
  unitName: string;
  isActive: boolean;
};
```

## Pattern to apply:

Instead of:

```typescript
const response = await apiClient.get('/api/endpoint');
setData(response.data.data); // unsafe
```

Use:

```typescript
const response = await apiClient.get<ApiResponse<DataType>>('/api/endpoint');
if (response.data.success && response.data.data) {
  setData(response.data.data); // type-safe
}
```
