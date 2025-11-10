import { body, param, query, validationResult } from 'express-validator';

// Middleware to handle validation errors
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Validation rules for media creation
export const validateMediaCreation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 255 })
    .withMessage('Title must be less than 255 characters')
    .escape(),
  body('author')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Author must be less than 255 characters')
    .escape(),
  body('media_type')
    .trim()
    .notEmpty()
    .withMessage('Media type is required')
    .isIn(['book', 'comic', 'movie', 'series', 'anime', 'cartoon'])
    .withMessage('Media type must be one of: book, comic, movie, series, anime, cartoon'),
  body('volume_episode')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Volume/Episode must be less than 100 characters')
    .escape(),
  body('tags')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Tags must be less than 500 characters')
    .escape(),
  body('start_date')
    .trim()
    .notEmpty()
    .withMessage('Start date is required')
    .isISO8601()
    .withMessage('Start date must be a valid date in YYYY-MM-DD format')
    .custom((value) => {
      const startDate = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Allow dates up to 10 years in the past and 1 year in the future
      const tenYearsAgo = new Date();
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
      const oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
      
      if (startDate < tenYearsAgo || startDate > oneYearFromNow) {
        throw new Error('Start date must be within the last 10 years or next year');
      }
      return true;
    }),
  body('end_date')
    .trim()
    .notEmpty()
    .withMessage('End date is required')
    .isISO8601()
    .withMessage('End date must be a valid date in YYYY-MM-DD format')
    .custom((value, { req }) => {
      const startDate = new Date(req.body.start_date);
      const endDate = new Date(value);
      
      if (endDate < startDate) {
        throw new Error('End date must be after or equal to start date');
      }
      
      // Check if duration is reasonable (max 1 year)
      const diffTime = Math.abs(endDate - startDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 365) {
        throw new Error('Duration cannot exceed 365 days');
      }
      
      return true;
    }),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes must be less than 1000 characters')
    .escape(),
  handleValidationErrors,
];

// Validation rules for media deletion
export const validateMediaDeletion = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Media ID must be a positive integer'),
  handleValidationErrors,
];

// Validation rules for media update
export const validateMediaUpdate = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Media ID must be a positive integer'),
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 255 })
    .withMessage('Title must be less than 255 characters')
    .escape(),
  body('author')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Author must be less than 255 characters')
    .escape(),
  body('media_type')
    .trim()
    .notEmpty()
    .withMessage('Media type is required')
    .isIn(['book', 'comic', 'movie', 'series', 'anime', 'cartoon'])
    .withMessage('Media type must be one of: book, comic, movie, series, anime, cartoon'),
  body('volume_episode')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Volume/Episode must be less than 100 characters')
    .escape(),
  body('tags')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Tags must be less than 500 characters')
    .escape(),
  body('start_date')
    .trim()
    .notEmpty()
    .withMessage('Start date is required')
    .isISO8601()
    .withMessage('Start date must be a valid date in YYYY-MM-DD format')
    .custom((value) => {
      const startDate = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Allow dates up to 10 years in the past and 1 year in the future
      const tenYearsAgo = new Date();
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
      const oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
      
      if (startDate < tenYearsAgo || startDate > oneYearFromNow) {
        throw new Error('Start date must be within the last 10 years or next year');
      }
      return true;
    }),
  body('end_date')
    .trim()
    .notEmpty()
    .withMessage('End date is required')
    .isISO8601()
    .withMessage('End date must be a valid date in YYYY-MM-DD format')
    .custom((value, { req }) => {
      const startDate = new Date(req.body.start_date);
      const endDate = new Date(value);
      
      if (endDate < startDate) {
        throw new Error('End date must be after or equal to start date');
      }
      
      // Check if duration is reasonable (max 1 year)
      const diffTime = Math.abs(endDate - startDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 365) {
        throw new Error('Duration cannot exceed 365 days');
      }
      
      return true;
    }),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes must be less than 1000 characters')
    .escape(),
  handleValidationErrors,
];

// Validation rules for media query
export const validateMediaQuery = [
  query('year')
    .optional()
    .isInt({ min: 1900, max: 2100 })
    .withMessage('Year must be between 1900 and 2100'),
  handleValidationErrors,
];
