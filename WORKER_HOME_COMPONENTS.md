# Worker Home Components - Architecture Documentation

## Overview
This document describes the reusable component architecture created for the Worker Home page, following Clean Code and SOLID principles.

## Component Structure

### 1. Base UI Components (`src/presentation/components/ui/`)

#### Button
- **Location**: `ui/Button/Button.tsx`
- **Props**: variant, size, children, fullWidth, borderColor, textColor
- **Variants**: primary, outline, ghost
- **Sizes**: sm, md, lg
- **Usage**: Reusable button with customizable styles

#### Card
- **Location**: `ui/Card/Card.tsx`
- **Props**: children, className, borderColor, backgroundColor, rounded
- **Rounded options**: sm, md, lg, xl
- **Usage**: Container component for content sections

#### Input
- **Location**: `ui/Input/Input.tsx`
- **Props**: icon, iconPosition, fullWidth, rounded
- **Features**: Icon support (left/right), customizable border radius
- **Usage**: Text input with optional icons

#### Dropdown
- **Location**: `ui/Dropdown/Dropdown.tsx`
- **Props**: label, placeholder, value, icon, className, rounded
- **Usage**: Dropdown selector component

### 2. Layout Components (`src/presentation/components/layout/`)

#### Sidebar
- **Location**: `layout/Sidebar/Sidebar.tsx`
- **Props**: children, footer, logo, isCollapsible, defaultCollapsed
- **Features**: 
  - Collapsible sidebar with hamburger menu
  - Fixed positioning
  - Footer support for user info
  - Scrollable menu area

#### SidebarMenuSection
- **Location**: `layout/Sidebar/SidebarMenuSection.tsx`
- **Props**: icon, label, children, isExpandable, defaultExpanded, onClick
- **Features**: Expandable menu sections with sub-items

#### SidebarMenuItem
- **Location**: `layout/Sidebar/SidebarMenuItem.tsx`
- **Props**: icon, label, iconClass, onClick
- **Usage**: Individual menu items within sections

#### SidebarUserFooter
- **Location**: `layout/Sidebar/SidebarUserFooter.tsx`
- **Props**: userName, userAvatar, batteryLevel
- **Features**: User profile display with battery indicator

#### TopNavbar
- **Location**: `layout/TopNavbar/TopNavbar.tsx`
- **Props**: userName, greeting, country, countryFlag, className
- **Usage**: Top navigation bar with user greeting

### 3. Common Components (`src/presentation/components/common/`)

#### DashboardCard
- **Location**: `common/DashboardCard/DashboardCard.tsx`
- **Props**: icon, title, subtitle, description, buttonText, onButtonClick, borderColor, textColor, backgroundColor, buttonVariant
- **Usage**: Feature cards for dashboard sections (Care, Learn, Clinic, etc.)

#### SummaryCard
- **Location**: `common/SummaryCard/SummaryCard.tsx`
- **Props**: icon, label, value, iconClass, contentClass
- **Usage**: Metric display cards (hours worked, reports, etc.)

#### AlertBanner
- **Location**: `common/AlertBanner/AlertBanner.tsx`
- **Props**: title, message, variant, className
- **Variants**: info, warning, error, success
- **Usage**: Alert/notification banners

#### AppStoreButtons
- **Location**: `common/AppStoreButtons/AppStoreButtons.tsx`
- **Props**: onPlayStoreClick, onAppStoreClick, className
- **Usage**: Google Play and App Store download buttons

#### Table
- **Location**: `common/Table/Table.tsx`
- **Props**: columns, children, className
- **Usage**: Table header with column definitions

#### TableRow
- **Location**: `common/Table/TableRow.tsx`
- **Props**: children, onClick, className
- **Usage**: Individual table rows

#### TableCell
- **Location**: `common/Table/TableCell.tsx`
- **Props**: children, position, align, className
- **Usage**: Table cell content

#### Pagination
- **Location**: `common/Pagination/Pagination.tsx`
- **Props**: currentPage, totalPages, itemsPerPage, totalItems, onPageChange, onItemsPerPageChange, className
- **Usage**: Table pagination controls

#### PageHeader
- **Location**: `common/PageHeader/PageHeader.tsx`
- **Props**: title, subtitle, className
- **Usage**: Section headers

### 4. Worker-Specific Components (`src/presentation/components/worker/`)

#### WorkerSidebar
- **Location**: `worker/WorkerSidebar/WorkerSidebar.tsx`
- **Features**: 
  - Complete sidebar with all menu sections
  - Home, Comunicação, Learn, Care, Clinic, Finanças, Setup
  - User footer with battery indicator
  - Expandable menu sections

#### WorkSummarySection
- **Location**: `worker/WorkSummarySection/WorkSummarySection.tsx`
- **Features**:
  - Alert banner for pending documents
  - Summary cards for metrics (hours, reports, vacancies)

#### DashboardInfoSection
- **Location**: `worker/DashboardInfoSection/DashboardInfoSection.tsx`
- **Features**:
  - Info graphic
  - Care, Learn, Clinic cards
  - Notifications card
  - Mobile app download card with store buttons

#### JobVacanciesSection
- **Location**: `worker/JobVacanciesSection/JobVacanciesSection.tsx`
- **Features**:
  - Search input
  - Status dropdown
  - Filter dropdowns (type, location, area, gender)
  - Job vacancies table
  - Pagination

### 5. Main Page (`src/presentation/pages/worker/`)

#### HomeWorkerPage
- **Location**: `pages/worker/HomeWorkerPage.tsx`
- **Composition**:
  - WorkerSidebar (fixed left)
  - TopNavbar
  - WorkSummarySection
  - DashboardInfoSection
  - JobVacanciesSection

## Design Principles Applied

### SOLID Principles

1. **Single Responsibility Principle (SRP)**
   - Each component has one clear purpose
   - UI components handle only presentation
   - Business logic separated from presentation

2. **Open/Closed Principle (OCP)**
   - Components are open for extension via props
   - Closed for modification through well-defined interfaces

3. **Liskov Substitution Principle (LSP)**
   - All button variants can be used interchangeably
   - Card components maintain consistent interface

4. **Interface Segregation Principle (ISP)**
   - Components only require props they actually use
   - Optional props for flexibility

5. **Dependency Inversion Principle (DIP)**
   - Components depend on abstractions (props interfaces)
   - Not on concrete implementations

### Clean Code Practices

1. **Meaningful Names**
   - Clear, descriptive component and prop names
   - Consistent naming conventions

2. **Small Functions**
   - Components are focused and concise
   - Helper functions extracted when needed

3. **DRY (Don't Repeat Yourself)**
   - Reusable components eliminate duplication
   - Common patterns extracted to base components

4. **Composition Over Inheritance**
   - Components composed from smaller components
   - Props for customization instead of inheritance

## Usage Example

```tsx
import { HomeWorkerPage } from './presentation/pages/worker/HomeWorkerPage';

// In your router or app
<Route path="/worker/home" element={<HomeWorkerPage />} />
```

## Component Reusability

All components are designed to be reusable across different contexts:

- **Button**: Can be used anywhere buttons are needed
- **Card**: Flexible container for any content
- **Input/Dropdown**: Form elements for any form
- **Table**: Reusable for any tabular data
- **Sidebar**: Can be customized for different user roles
- **DashboardCard**: Adaptable for different feature sections

## Future Enhancements

1. Add proper event handlers for all interactive elements
2. Implement actual data fetching and state management
3. Add loading and error states
4. Implement responsive design for mobile
5. Add accessibility features (ARIA labels, keyboard navigation)
6. Add unit tests for all components
7. Implement theme customization
8. Add animation and transitions

## Notes

- All components use Tailwind CSS for styling
- Design tokens from the original Figma design are preserved
- Components are TypeScript-first with proper type definitions
- All components are exported with their type definitions for better IDE support
