import Joi from "@hapi/joi";

// Define Joi schema for user registration
export const landingpage_validate_email = Joi.object({
  email: Joi.string().email().required(),
});
