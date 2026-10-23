const CUSTOMER_PROFILE_URL = "http://localhost:3000/api/auth/customer-address";

export interface CustomerProfile {
  deliveryAddress: string;
  city: string;
  country: string;
}

interface CustomerProfileResponse extends CustomerProfile {
  error?: string;
}

async function requestCustomerProfile(token: string, init?: RequestInit): Promise<CustomerProfileResponse> {
  const response = await fetch(CUSTOMER_PROFILE_URL, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  const body: unknown = await response.json();

  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body
      && typeof body.error === "string"
      ? body.error
      : `Customer profile request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }

  return body as CustomerProfileResponse;
}

export async function getCustomerProfile(token: string): Promise<CustomerProfile> {
  const result = await requestCustomerProfile(token);
  return {
    deliveryAddress: result.deliveryAddress,
    city: result.city,
    country: result.country,
  };
}

export async function saveCustomerProfile(token: string, profile: CustomerProfile): Promise<CustomerProfile> {
  const result = await requestCustomerProfile(token, {
    method: "PUT",
    body: JSON.stringify(profile),
  });
  return {
    deliveryAddress: result.deliveryAddress,
    city: result.city,
    country: result.country,
  };
}
