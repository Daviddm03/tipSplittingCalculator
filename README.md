# Tip Splitting Calculator

A web application for distributing staff tips based on the number of days worked during a selected period.

The project was inspired by my experience working in hospitality and by the need to make tip distribution easier to calculate, review, and explain.

## About

The calculator allows a manager to select a period, enter the total amount of tips, choose the employees who participated, and specify how many days each person worked.

The distribution is then calculated proportionally:

```text
employee share = employee days worked / total days worked
```

The final payments are calculated in integer cents so the distributed amount always matches the original tip total.

When residual cents remain, they are assigned using the largest remainder method.

## Features

- Select month and year
- Enter the total tip amount
- Filter employees by outlet
- Select participating employees
- Enter days worked for each employee
- Review the distribution before calculating
- Calculate proportional payments
- Handle residual cents deterministically
- Display the value per worked day
- Generate a PDF with the final distribution
- Start a new calculation without reloading the page
- Input and calculation validation

The application currently contains a predefined employee list and keeps the calculation state in memory. It does not use a database or persistent storage.

## How the Calculation Works

For example, if:

```text
Total tips: €300
Total worked days: 30
```

The base value is:

```text
€300 / 30 = €10 per day
```

An employee who worked 20 days receives approximately:

```text
20 × €10 = €200
```

The actual calculation is performed using integer cents rather than floating-point euro values to avoid rounding errors.

## Getting Started

No framework or build process is required.

Clone the repository:

```bash
git clone git@github.com:Daviddm03/tipSplittingCalculator.git
cd tipSplittingCalculator
```

You can open `index.html` directly in a browser.

For local development, a simple local server can also be used.

With VS Code and Live Server, open:

```text
index.html
```

and select:

```text
Open with Live Server
```

## Tests

The calculation logic is separated into `distribution.js`, which allows it to be tested without the browser interface.

Run the distribution tests with:

```bash
node tests/distribution.test.cjs
```

Browser-related tests are also available in:

```text
tests/browser.cjs
```

## Project Structure

```text
.
├── index.html
├── style.css
├── script.js
├── distribution.js
├── tests/
└── docs/
```

`distribution.js` contains the core calculation and validation logic, while `script.js` manages the interface, application state, navigation, and PDF generation.

## What I Learned

This project started as a simple calculator but became much more about handling real application state and making the calculation reliable.

Separating the distribution logic from the DOM made the code easier to test and reason about. Handling money in integer cents also solved the rounding problems that appear when currency calculations rely directly on floating-point numbers.

Because the idea came from a real workflow I already knew, it also made me think more about UX and how someone would actually use the tool during a working day.

## Tech

JavaScript · HTML · CSS · jsPDF · Node.js tests
