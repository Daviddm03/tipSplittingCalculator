const loadingScreen = document.querySelector(".loading-screen");
const loadingBar = document.querySelector(".loader-bar");
const loadingPercentage = document.querySelector("#loading-percentage");
const calculationScreen = document.querySelector(".app");
const employeeSelectionScreen = document.querySelector(".employee-selection");
const reviewCalculationScreen = document.querySelector(".review-calculation");
const reviewPeriod = document.querySelector("#review-period");
const reviewTips = document.querySelector("#review-tips");
const reviewCount = document.querySelector("#review-count");
document.body.classList.add("loading");

function updateReviewSummary() {
    reviewPeriod.textContent = selectedPeriod.textContent;
    reviewTips.textContent = '€ ' + formatCents(parseMoneyToCents(tipsInput.value));
    reviewCount.textContent = selectedEmployees.length;
    document.querySelector('#review-days').textContent = selectedEmployees.reduce(
        (sum, employee) => sum + parseDaysWorked(employee.daysWorked), 0
    );
}

function renderReviewEmployees() {
    renderDistributionRows(document.querySelector('#review-employee-list'), selectedEmployees, false);
}

function renderDistributionRows(container, participants, includeAmount) {
    container.replaceChildren();
    participants.forEach(employee => {
        const row = document.createElement('div');
        row.className = includeAmount ? 'distribution-row with-amount' : 'distribution-row';
        row.dataset.employeeId = employee.id;
        const values = [employee.name, employee.outlet, employee.daysWorked + ' days'];
        if (includeAmount) values.push('€ ' + formatCents(employee.amountCents));
        values.forEach(value => {
            const cell = document.createElement('span');
            cell.textContent = value;
            row.appendChild(cell);
        });
        container.appendChild(row);
    });
}

function calculateDistribution() {
    if (!hasValidPeriod()) throw new Error('Please select a period.');
    return {
        period: selectedPeriod.textContent,
        ...distributeTips(parseMoneyToCents(tipsInput.value), selectedEmployees)
    };
}

function generatePDF() {
    const pdfError = document.querySelector('#pdf-error');
    pdfError.textContent = '';
    if (!calculationResult) {
        pdfError.textContent = 'Calculate a distribution before downloading the PDF.';
        return;
    }
    try {
        if (!window.jspdf?.jsPDF) throw new Error('PDF library unavailable');
        const pdf = new window.jspdf.jsPDF();
        const result = calculationResult;
        // jsPDF text/addPage APIs: https://parallax.github.io/jsPDF/docs/jsPDF.html
        pdf.setTextColor(20, 20, 20);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(24);
        pdf.text('TIP SPLITTING', 20, 25);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.text('CALCULATION REPORT', 20, 33);
        pdf.text('PERIOD: ' + result.period, 20, 46);
        pdf.text('TOTAL TIPS: € ' + formatCents(result.totalTipsCents), 20, 55);
        pdf.text('TOTAL WORKED DAYS: ' + result.totalWorkedDays, 20, 64);
        pdf.text('VALUE PER DAY: € ' + formatCents(result.valuePerDayCents) + ' (rounded)', 20, 73);
        pdf.text('EMPLOYEES: ' + result.employeeCount, 20, 82);
        pdf.setFontSize(9);
        pdf.text('Proportional to days worked. Residual cents: largest remainder, then employee ID.', 20, 91);
        let y = 103;
        const tableHeader = () => {
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(9);
            pdf.text('NAME', 20, y);
            pdf.text('OUTLET', 82, y);
            pdf.text('DAYS', 143, y, { align: 'right' });
            pdf.text('AMOUNT', 190, y, { align: 'right' });
            pdf.setFont('helvetica', 'normal');
            y += 9;
        };
        tableHeader();
        result.payments.forEach(employee => {
            const name = pdf.splitTextToSize(employee.name, 58);
            const outlet = pdf.splitTextToSize(employee.outlet, 50);
            const days = pdf.splitTextToSize(String(employee.daysWorked), 22);
            const rowHeight = Math.max(name.length, outlet.length, days.length) * 5 + 4;
            if (y + rowHeight > 262) {
                pdf.addPage();
                y = 24;
                tableHeader();
            }
            pdf.text(name, 20, y);
            pdf.text(outlet, 82, y);
            pdf.text(days, 143, y, { align: 'right' });
            pdf.text('€ ' + formatCents(employee.amountCents), 190, y, { align: 'right' });
            y += rowHeight;
        });
        if (y + 14 > 270) { pdf.addPage(); y = 24; }
        pdf.setFont('helvetica', 'bold');
        pdf.text('TOTAL DISTRIBUTED: € ' + formatCents(result.totalDistributedCents), 20, y + 8);
        const pageCount = pdf.getNumberOfPages();
        for (let page = 1; page <= pageCount; page++) {
            pdf.setPage(page);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            pdf.setTextColor(120, 120, 120);
            pdf.text('Generated by Tip Splitting Calculator', 20, 285);
            pdf.text(page + ' / ' + pageCount, 190, 285, { align: 'right' });
        }
        pdf.save('tip-splitting-' + result.period.replaceAll(' ', '-').toLowerCase() + '.pdf');
    } catch {
        pdfError.textContent = 'Unable to generate PDF. Check your connection and try again.';
    }
}

const downloadPDFButton = document.querySelector(
    ".download-pdf-button"
);

downloadPDFButton.addEventListener("click", () => {
    generatePDF();
});

const calculateButton = document.querySelector(".calculate-button");
const calculatingScreen = document.querySelector(".calculating-screen");

let calculationResult = null;
let calculatingInterval = null;
let calculationSession = Date.now();

function cancelCalculation() {
    if (calculatingInterval !== null) {
        clearInterval(calculatingInterval);
        calculatingInterval = null;
        calculationResult = null;
    }
    calculateButton.disabled = false;
}

function invalidateResult() {
    cancelCalculation();
    calculationResult = null;
    document.querySelectorAll('.result-field strong, #result-amount, #result-total').forEach(node => {
        node.textContent = '—';
    });
    document.querySelector('#result-employee-list').replaceChildren();
    document.querySelector('#pdf-error').textContent = '';
}

function hasValidPeriod() {
    return Number.isInteger(selectedMonth) && selectedMonth >= 0 && selectedMonth < 12
        && Number.isSafeInteger(selectedYear) && selectedYear > 0;
}

function resolveScreen(screenName) {
    if (!hasValidPeriod() || parseMoneyToCents(tipsInput.value) === null) return 'calculation';
    if (screenName === 'result' && calculationResult) return 'result';
    if (screenName === 'review' || screenName === 'result') {
        return validateParticipants(selectedEmployees) ? 'employees' : 'review';
    }
    return screenName === 'employees' ? 'employees' : 'calculation';
}

const resultScreen = document.querySelector(".result-screen");

function showScreen(screenName) {
    cancelCalculation();
    screenName = resolveScreen(screenName);
    if (history.state?.session !== calculationSession || history.state?.screen !== screenName) {
        history.replaceState({ screen: screenName, session: calculationSession }, '', '#' + screenName);
    }
    if (screenName === 'review') {
        updateReviewSummary();
        renderReviewEmployees();
    }
    if (screenName === 'result') renderResult();
    calculationScreen.classList.add("hidden");
    employeeSelectionScreen.classList.remove("visible");
    reviewCalculationScreen.classList.remove("visible");
    resultScreen.classList.remove("visible");

    calculatingScreen.classList.remove("visible");

    if (screenName === "calculation") {
        calculationScreen.classList.remove("hidden");
        calculationScreen.classList.add("visible");
    }

    if (screenName === "employees") {
        employeeSelectionScreen.classList.add("visible");
    }

    if (screenName === "review") {
        reviewCalculationScreen.classList.add("visible");
    }

    if (screenName === "result") {
        resultScreen.classList.add("visible");
    }
}

function navigateTo(screenName) {
    history.pushState(
        { screen: screenName, session: calculationSession },
        "",
        `#${screenName}`
    );

    showScreen(screenName);
}

window.addEventListener('popstate', (event) => {
    const screenName = event.state?.session === calculationSession ? event.state.screen : 'calculation';
    showScreen(screenName);
});

history.replaceState({ screen: 'calculation', session: calculationSession }, '', '#calculation');

const newCalculationButton = document.querySelector(
    ".new-calculation-button"
);

function resetCalculation() {
    calculationSession++;
    invalidateResult();
    periodPicker.style.display = 'none';
    isPeriodPickerOpen = false;
    periodArrow.textContent = '↓';
    pickerYearValue = new Date().getFullYear();
    pickerYear.textContent = pickerYearValue;
    document.querySelectorAll('.review-field strong').forEach(node => node.textContent = '—');
    document.querySelector('#review-employee-list').replaceChildren();
    document.querySelector('.calculating-loader-bar').style.width = '0%';
    document.querySelector('#calculating-percentage').textContent = '0%';
    tipsInput.value = "";
    tipsInput.removeAttribute("aria-invalid");

    selectedPeriod.textContent = "SELECT PERIOD";

    selectedYear = null;
    selectedMonth = null;

    monthButtons.forEach((month) => {
        month.classList.remove("selected");
    });

    clearPeriodError();

    tipsError.textContent = "";
    tipsError.classList.remove("visible");
    tipsField.classList.remove("has-error");

    selectedEmployees = [];
    selectedOutlet = null;

    employeeError.classList.remove("visible");

    outletList.querySelectorAll("button").forEach((button) => {
        button.classList.remove("active");
    });

    allOutletsButton.classList.add("active");

    renderEmployees(employees);

    calculationResult = null;
}

newCalculationButton.addEventListener("click", () => {
    resetCalculation();
    navigateTo("calculation");
});

const resultPeriod = document.querySelector("#result-period");
const resultTips = document.querySelector("#result-tips");
const resultCount = document.querySelector("#result-count");
const resultAmount = document.querySelector("#result-amount");

function renderResult() {
    const result = calculationResult;
    resultPeriod.textContent = result.period;
    resultTips.textContent = '€ ' + formatCents(result.totalTipsCents);
    resultCount.textContent = result.employeeCount;
    resultAmount.textContent = '€ ' + formatCents(result.valuePerDayCents);
    document.querySelector('#result-days').textContent = result.totalWorkedDays;
    document.querySelector('#result-total').textContent = '€ ' + formatCents(result.totalDistributedCents);
    renderDistributionRows(document.querySelector('#result-employee-list'), result.payments, true);
}

function showResult() {
    navigateTo('result');
}

calculateButton.addEventListener('click', () => {
    if (calculatingInterval !== null) return;
    if (!validateCalculationForm()) { navigateTo('calculation'); return; }
    if (!validateEmployeeSelection()) { navigateTo('employees'); return; }
    calculationResult = calculateDistribution();
    calculateButton.disabled = true;
    reviewCalculationScreen.classList.remove('visible');
    calculatingScreen.classList.add('visible');
    const bar = document.querySelector('.calculating-loader-bar');
    const percentage = document.querySelector('#calculating-percentage');
    let progress = 0;
    bar.style.width = '0%';
    percentage.textContent = '0%';
    calculatingInterval = setInterval(() => {
        progress++;
        bar.style.width = progress + '%';
        percentage.textContent = progress + '%';
        if (progress >= 100) {
            clearInterval(calculatingInterval);
            calculatingInterval = null;
            calculateButton.disabled = false;
            showResult();
        }
    }, 30);
});

function goToReviewCalculation() {
    if (!validateCalculationForm()) { navigateTo('calculation'); return; }
    if (!validateEmployeeSelection()) return;
    navigateTo('review');
}

let progress = 0;

const loadingInterval = setInterval(() => {

    progress++;
    loadingBar.style.width = `${progress}%`;
    loadingPercentage.textContent = `${progress}%`;
    if (progress >= 100) {
        clearInterval(loadingInterval);
        setTimeout(() => {
            loadingScreen.classList.add("hidden");
            document.body.classList.remove("loading");
            setTimeout(() => {
                calculationScreen.classList.add("visible");
            }, 400);
        }, 200);
    }
}, 30);

const periodSelector = document.querySelector("#period-selector");
const periodPicker = document.querySelector("#period-picker");
const periodArrow = periodSelector.querySelector(".period-arrow");
const pickerYear = document.querySelector("#picker-year");
const previousYear = document.querySelector("#previous-year");
const nextYear = document.querySelector("#next-year");
const selectedPeriod = document.querySelector("#selected-period");
const monthButtons = document.querySelectorAll(".months-grid button");
const periodError = document.querySelector("#period-error");
const periodField = periodSelector.closest(".form-field");
let isPeriodPickerOpen = false;
let pickerYearValue = new Date().getFullYear();
let selectedYear = null;
let selectedMonth = null;

pickerYear.textContent = pickerYearValue;

periodSelector.addEventListener("click", () => {

    isPeriodPickerOpen = !isPeriodPickerOpen;
    periodPicker.style.display =
        isPeriodPickerOpen ? "block" : "none";
    periodArrow.textContent =
        isPeriodPickerOpen ? "×" : "↓";
});

previousYear.addEventListener("click", () => {

    pickerYearValue--;
    pickerYear.textContent = pickerYearValue;
});

nextYear.addEventListener("click", () => {

    pickerYearValue++;
    pickerYear.textContent = pickerYearValue;
});

const monthNames = [
    "JANUARY",
    "FEBRUARY",
    "MARCH",
    "APRIL",
    "MAY",
    "JUNE",
    "JULY",
    "AUGUST",
    "SEPTEMBER",
    "OCTOBER",
    "NOVEMBER",
    "DECEMBER"
];

monthButtons.forEach((button) => {

    button.addEventListener("click", () => {
        monthButtons.forEach((month) => {
            month.classList.remove("selected");
        });
        button.classList.add("selected");
        invalidateResult();
        selectedMonth = Number(button.dataset.month);
        selectedYear = pickerYearValue;
        selectedPeriod.textContent =
            `${monthNames[selectedMonth]} ${selectedYear}`;
        periodPicker.style.display = "none";
        isPeriodPickerOpen = false;
        periodArrow.textContent = "↓";
        clearPeriodError();
    });
});

function clearPeriodError() {

    periodError.textContent = "";
    periodError.classList.remove("visible");
    periodField.classList.remove("has-error");
}



const calculationForm = document.querySelector(".calculation-form");
const tipsInput = document.querySelector("#tips");
const tipsError = document.querySelector("#tips-error");
const tipsField = tipsInput.closest(".form-field");

tipsInput.addEventListener('input', invalidateResult);

function validateCalculationForm() {
    let isValid = true;
    clearPeriodError();
    tipsError.textContent = '';
    tipsError.classList.remove('visible');
    tipsField.classList.remove('has-error');
    tipsInput.removeAttribute('aria-invalid');
    if (!hasValidPeriod()) {
        periodError.textContent = 'Please select a period.';
        periodError.classList.add('visible');
        periodField.classList.add('has-error');
        isValid = false;
    }
    if (parseMoneyToCents(tipsInput.value) === null) {
        tipsError.textContent = 'Enter a non-negative amount with up to 2 decimals (maximum € 90,071,992,547,409.91).';
        tipsError.classList.add('visible');
        tipsField.classList.add('has-error');
        tipsInput.setAttribute('aria-invalid', 'true');
        isValid = false;
    }
    return isValid;
}

calculationForm.addEventListener('submit', event => {
    event.preventDefault();
    if (validateCalculationForm()) navigateTo('employees');
});

const employees = [
    
    {
        id: 1,
        name: "David Montaño",
        role: "Barman de primeira",
        outlet: "Sky Bar"
    },
    {
        id: 2,
        name: "José Ferro",
        role: "Chefe de bar",
        outlet: "Sky Bar"
    },
    {
        id: 3,
        name: "Marilia Campos",
        role: "Hostess",
        outlet: "Sky Bar"
    },
    {
        id: 4,
        name: "João Martins",
        role: "Barman de segunda",
        outlet: "Sky Bar"
    },
    {
        id: 5,
        name: "Clebinho Show",
        role: "Empregado de mesa de segunda",
        outlet: "Sky Bar"
    },
    {
        id: 6,
        name: "Ines Pereira",
        role: "Empregada de mesa de primeira",
        outlet: "Sky Bar"
    },
    {
        id: 7,
        name: "Paulo Roberto",
        role: "Empregado de mesa de segunda",
        outlet: "Sky Bar"
    },

    {
        id: 8,
        name: "Alberto Pereira",
        role: "Chefe de bar",
        outlet: "Wine Bar 1638"
    },
    {
        id: 9,
        name: "Jorge Silva",
        role: "Sommelier",
        outlet: "Wine Bar 1638"
    },
    {
        id: 10,
        name: "Filipe Costa",
        role: "Barman de primeira",
        outlet: "Wine Bar 1638"
    },
    {
        id: 11,
        name: "Marta Rodrigues",
        role: "Barman de segunda",
        outlet: "Wine Bar 1638"
    },
    {
        id: 12,
        name: "Tony Montana",
        role: "Empregado de mesa de primeira",
        outlet: "Wine Bar 1638"
    },
    {
        id: 13,
        name: "Nacho Lopez",
        role: "Empregado de mesa de segunda",
        outlet: "Wine Bar 1638"
    },

    {
        id: 14,
        name: "Moisés Caicedo",
        role: "Barman de primeira",
        outlet: "Wine & Jazz"
    },
    {
        id: 15,
        name: "Marisa Monteiro",
        role: "Barman de segunda",
        outlet: "Wine & Jazz"
    },
    {
        id: 16,
        name: "Josildo Ferreira",
        role: "Sommelier",
        outlet: "Wine & Jazz"
    },
    {
        id: 17,
        name: "Nicole Dias",
        role: "Empregado de mesa de primeira",
        outlet: "Wine & Jazz"
    },
    {
        id: 18,
        name: "Lucas Alves",
        role: "Empregado de mesa de segunda",
        outlet: "Wine & Jazz"
    },
    {
        id: 19,
        name: "Monica Silva",
        role: "Hostess",
        outlet: "Wine & Jazz"
    },

    {
        id: 20,
        name: "Vasco Martins",
        role: "Barman de primeira",
        outlet: "Pool Bar"
    },
    {
        id: 21,
        name: "Hugo Costa",
        role: "Barman de segunda",
        outlet: "Pool Bar"
    },
    {
        id: 22,
        name: "Marco Silva",
        role: "Barman de segunda",
        outlet: "Pool Bar"
    },
    {
        id: 23,
        name: "Leonor Sousa",
        role: "Empregada de mesa de primeira",
        outlet: "Pool Bar"
    },
    {
        id: 24,
        name: "Rita Fernandes",
        role: "Hostess",
        outlet: "Pool Bar"
    },

    {
        id: 25,
        name: "António Pereira",
        role: "Chefe de sala",
        outlet: "Restaurante 1638"
    },
    {
        id: 26,
        name: "Fábio Martins",
        role: "Subchefe de sala",
        outlet: "Restaurante 1638"
    },
    {
        id: 27,
        name: "Tomás Silva",
        role: "Empregado de mesa de primeira",
        outlet: "Restaurante 1638"
    },
    {
        id: 28,
        name: "Rodrigo Costa",
        role: "Empregado de mesa de primeira",
        outlet: "Restaurante 1638"
    },
    {
        id: 29,
        name: "Marta Almeida",
        role: "Empregada de mesa de segunda",
        outlet: "Restaurante 1638"
    },
    {
        id: 30,
        name: "Joana Ferreira",
        role: "Empregada de mesa de segunda",
        outlet: "Restaurante 1638"
    },
    {
        id: 31,
        name: "Nuno Lopes",
        role: "Sommelier",
        outlet: "Restaurante 1638"
    },

    {
    id: 32,
    name: "Ricardo Santos",
    role: "Chefe de sala",
    outlet: "Restaurante Boa Vista"
    },
    {
        id: 33,
        name: "Filipe Carvalho",
        role: "Subchefe de sala",
        outlet: "Restaurante Boa Vista"
    },
    {
        id: 34,
        name: "Luís Oliveira",
        role: "Empregado de mesa de primeira",
        outlet: "Restaurante Boa Vista"
    },
    {
        id: 35,
        name: "André Martins",
        role: "Empregado de mesa de segunda",
        outlet: "Restaurante Boa Vista"
    },
    {
        id: 36,
        name: "Mariana Costa",
        role: "Empregada de mesa de primeira",
        outlet: "Restaurante Boa Vista"
    },
    {
        id: 37,
        name: "Beatriz Lopes",
        role: "Hostess",
        outlet: "Restaurante Boa Vista"
    },

    {
        id: 38,
        name: "Carlos Mendes",
        role: "Chefe de cozinha",
        outlet: "Cozinha 1638"
    },
    {
        id: 39,
        name: "João Pereira",
        role: "Subchefe de cozinha",
        outlet: "Cozinha 1638"
    },
    {
        id: 40,
        name: "Diogo Silva",
        role: "Cozinheiro de primeira",
        outlet: "Cozinha 1638"
    },
    {
        id: 41,
        name: "Bruno Martins",
        role: "Cozinheiro de primeira",
        outlet: "Cozinha 1638"
    },
    {
        id: 42,
        name: "Pedro Costa",
        role: "Cozinheiro de segunda",
        outlet: "Cozinha 1638"
    },
    {
        id: 43,
        name: "Rafael Almeida",
        role: "Cozinheiro de segunda",
        outlet: "Cozinha 1638"
    },

    {
        id: 44,
        name: "Miguel Ferreira",
        role: "Chefe de cozinha",
        outlet: "Cozinha Central (Boa Vista)"
    },
    {
        id: 45,
        name: "André Lopes",
        role: "Subchefe de cozinha",
        outlet: "Cozinha Central (Boa Vista)"
    },
    {
        id: 46,
        name: "Tiago Santos",
        role: "Cozinheiro de primeira",
        outlet: "Cozinha Central (Boa Vista)"
    },
    {
        id: 47,
        name: "Gonçalo Martins",
        role: "Cozinheiro de primeira",
        outlet: "Cozinha Central (Boa Vista)"
    },
    {
        id: 48,
        name: "Hugo Pereira",
        role: "Cozinheiro de segunda",
        outlet: "Cozinha Central (Boa Vista)"
    },
    {
        id: 49,
        name: "Marco Oliveira",
        role: "Cozinheiro de segunda",
        outlet: "Cozinha Central (Boa Vista)"
    },

    {
        id: 50,
        name: "Ana Martins",
        role: "Empregada de andares",
        outlet: "Housekeeping"
    },
    {
        id: 51,
        name: "Carla Silva",
        role: "Empregada de andares",
        outlet: "Housekeeping"
    },
    {
        id: 52,
        name: "Patrícia Costa",
        role: "Empregada de andares",
        outlet: "Housekeeping"
    },
    {
        id: 53,
        name: "Sandra Ferreira",
        role: "Empregada de andares",
        outlet: "Housekeeping"
    },
    {
        id: 54,
        name: "Daniela Santos",
        role: "Empregada de andares",
        outlet: "Housekeeping"
    },
    {
        id: 55,
        name: "Helena Almeida",
        role: "Empregada de andares",
        outlet: "Housekeeping"
    },

    {
        id: 56,
        name: "Vasco Pereira",
        role: "Chefe de sala",
        outlet: "Eventos"
    },
    {
        id: 57,
        name: "João Costa",
        role: "Barman de primeira",
        outlet: "Eventos"
    },
    {
        id: 58,
        name: "Ricardo Martins",
        role: "Barman de segunda",
        outlet: "Eventos"
    },
    {
        id: 59,
        name: "Tiago Silva",
        role: "Empregado de mesa de primeira",
        outlet: "Eventos"
    },
    {
        id: 60,
        name: "Pedro Almeida",
        role: "Empregado de mesa de primeira",
        outlet: "Eventos"
    },
    {
        id: 61,
        name: "André Santos",
        role: "Empregado de mesa de segunda",
        outlet: "Eventos"
    },
    {
        id: 62,
        name: "Inês Costa",
        role: "Hostess",
        outlet: "Eventos"
    },
    {
        id: 63,
        name: "Bruno Ferreira",
        role: "Cozinheiro de primeira",
        outlet: "Eventos"
    }
];

/* EMPLOYEE SELECTION */

const outlets = [...new Set(employees.map((employee) => {
    return employee.outlet;
}))];

const outletList = document.querySelector("#outlet-list");
const employeeList = document.querySelector("#employee-list");

let selectedEmployees = [];
let selectedOutlet = null;

/* =========================
   EMPLOYEE PANEL
========================= */

const employeePanel = document.createElement("div");

employeePanel.classList.add("employee-panel");

const employeeSelection = employeeList.parentElement;

employeeSelection.appendChild(employeePanel);

employeePanel.appendChild(employeeList);

const continueEmployeesButton = document.createElement("button");

continueEmployeesButton.textContent = "CONTINUE";

continueEmployeesButton.classList.add("continue-employees-button");

employeePanel.appendChild(continueEmployeesButton);

const employeeError = document.createElement("p");

employeeError.textContent = "SELECT AT LEAST ONE EMPLOYEE";

employeeError.classList.add('employee-error');
employeeError.id = 'employee-error';
employeeError.setAttribute('role', 'alert');

employeePanel.appendChild(employeeError);

function validateEmployeeSelection() {
    const error = validateParticipants(selectedEmployees);
    employeeError.textContent = error || '';
    employeeError.classList.toggle('visible', Boolean(error));
    employeeList.querySelectorAll('.days-input').forEach(input => {
        const invalid = !input.disabled && parseDaysWorked(input.value) === null;
        input.setAttribute('aria-invalid', String(invalid));
    });
    return !error;
}

continueEmployeesButton.addEventListener('click', goToReviewCalculation);

/* EMPLOYEE HEADER */

const employeeHeader = document.createElement("div");

employeeHeader.classList.add("employee-header");
employeePanel.insertBefore(
    employeeHeader,
    employeeList
);

/* HEADER CONTENT */

const teamLabel = document.createElement("span");

teamLabel.textContent = "TEAM";
employeeHeader.appendChild(teamLabel);

const employeeActions = document.createElement("div");

employeeActions.classList.add("employee-actions");
employeeHeader.appendChild(employeeActions);

/* SELECTED COUNT */

const selectedCount = document.createElement("span");

selectedCount.textContent = "0 SELECTED";
employeeActions.appendChild(selectedCount);

/* SELECT ALL */

const selectAllButton = document.createElement("button");

selectAllButton.textContent = "SELECT ALL";
employeeActions.appendChild(selectAllButton);
selectAllButton.addEventListener('click', () => {
    const visibleEmployees = getVisibleEmployees();
    const allSelected = visibleEmployees.every(employee => selectedEmployees.some(selected => selected.id === employee.id));
    visibleEmployees.forEach(employee => setEmployeeSelected(employee, !allSelected));
    renderEmployees(visibleEmployees);
});

function setEmployeeSelected(employee, selected) {
    const existing = selectedEmployees.find(item => item.id === employee.id);
    if (selected && !existing) selectedEmployees.push({ ...employee, daysWorked: '' });
    if (!selected) selectedEmployees = selectedEmployees.filter(item => item.id !== employee.id);
    invalidateResult();
    employeeError.classList.remove('visible');
    updateSelectedCount();
}

function updateDaysWorked(employeeId, value) {
    const employee = selectedEmployees.find(item => item.id === employeeId);
    if (!employee) return;
    employee.daysWorked = value;
    invalidateResult();
    employeeError.classList.remove('visible');
}

/* ALL OUTLETS */

const allOutletsButton = document.createElement("button");

allOutletsButton.textContent = "ALL OUTLETS";
allOutletsButton.addEventListener("click", () => {

    outletList.querySelectorAll("button").forEach((button) => {
        button.classList.remove("active");
    });

    allOutletsButton.classList.add("active");
    selectedOutlet = null;
    renderEmployees(employees);
});
outletList.appendChild(allOutletsButton);
allOutletsButton.classList.add("active");
renderEmployees(employees);

/* GET VISIBLE EMPLOYEE */

function getVisibleEmployees() {

    if (selectedOutlet === null) {
        return employees;
    }
    return employees.filter((employee) => {
        return employee.outlet === selectedOutlet;
    });
}

/* UPDATE SELECTED COUNT */

function updateSelectedCount() {
    selectedCount.textContent = `${selectedEmployees.length} SELECTED`;
}

/* RENDER EMPLOYEES */

function renderEmployees(employeeArray) {
    employeeList.replaceChildren();
    employeeList.classList.toggle('scrollable', selectedOutlet === null);
    employeeArray.forEach(employee => {
        const selected = selectedEmployees.find(item => item.id === employee.id);
        const row = document.createElement('div');
        row.className = 'employee';
        row.classList.toggle('selected', Boolean(selected));
        const label = document.createElement('label');
        label.className = 'employee-choice';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = Boolean(selected);
        checkbox.id = 'employee-' + employee.id;
        const details = document.createElement('div');
        details.className = 'employee-details';
        const name = document.createElement('span');
        name.textContent = employee.name;
        const role = document.createElement('span');
        role.textContent = employee.role + ' · ' + employee.outlet;
        details.append(name, role);
        label.append(checkbox, details);
        const daysLabel = document.createElement('label');
        daysLabel.className = 'days-field';
        daysLabel.hidden = !selected;
        const caption = document.createElement('span');
        caption.textContent = 'DAYS WORKED';
        const input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'numeric';
        input.pattern = '[0-9]*';
        input.className = 'days-input';
        input.id = 'days-' + employee.id;
        input.autocomplete = 'off';
        input.value = selected?.daysWorked ?? '';
        input.disabled = !selected;
        input.required = true;
        input.setAttribute('aria-label', 'Days worked — ' + employee.name);
        input.setAttribute('aria-describedby', 'employee-error');
        input.setAttribute('aria-invalid', String(Boolean(selected) && parseDaysWorked(input.value) === null));
        input.addEventListener('input', () => {
            updateDaysWorked(employee.id, input.value);
            input.setAttribute('aria-invalid', String(parseDaysWorked(input.value) === null));
        });
        checkbox.addEventListener('change', () => {
            setEmployeeSelected(employee, checkbox.checked);
            row.classList.toggle('selected', checkbox.checked);
            daysLabel.hidden = !checkbox.checked;
            input.disabled = !checkbox.checked;
            input.value = '';
            input.setAttribute('aria-invalid', String(checkbox.checked));
        });
        daysLabel.append(caption, input);
        row.append(label, daysLabel);
        employeeList.appendChild(row);
    });
    updateSelectedCount();
}

/* OUTLET FILTER */

outlets.forEach((outlet) => {

    const button = document.createElement("button");

    button.textContent = outlet;
    button.addEventListener("click", () => {
        outletList.querySelectorAll("button").forEach((button) => {
            button.classList.remove("active");
        });
        button.classList.add("active");
        selectedOutlet = outlet;

        renderEmployees(getVisibleEmployees());
    });
    outletList.appendChild(button);
});