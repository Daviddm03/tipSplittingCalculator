const loadingScreen = document.querySelector(".loading-screen");
const loadingBar = document.querySelector(".loader-bar");
const loadingPercentage = document.querySelector("#loading-percentage");
const app = document.querySelector(".app");
const calculationScreen = document.querySelector(".app");
const employeeSelectionScreen = document.querySelector(".employee-selection");

function goToEmployeeSelection() {
    calculationScreen.classList.add("hidden");
    employeeSelectionScreen.classList.add("visible");
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
            setTimeout(() => {
                app.classList.add("visible");
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

function formatMoney(value) {

    return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}

const calculationForm = document.querySelector(".calculation-form");
const tipsInput = document.querySelector("#tips");
const tipsError = document.querySelector("#tips-error");
const tipsField = tipsInput.closest(".form-field");

calculationForm.addEventListener("submit", (event) => {

    event.preventDefault();
    let isValid = true;
    clearPeriodError();
    tipsError.textContent = "";
    tipsError.classList.remove("visible");
    tipsField.classList.remove("has-error");
    if (selectedMonth === null || selectedYear === null) {
        periodError.textContent =
            "Please select a period.";
        periodError.classList.add("visible");
        periodField.classList.add("has-error");
        isValid = false;
    }
    const tips = Number(tipsInput.value);
    if (!tips || tips <= 0) {
        tipsError.textContent =
            "Enter a valid tips amount.";
        tipsError.classList.add("visible");
        tipsField.classList.add("has-error");
        isValid = false;
    }
    if (!isValid) {
        return;
    }
    console.log(
        "Period:",
        `${selectedYear}-${selectedMonth + 1}`
    );
    console.log(
        "Total Tips:",
        `€ ${formatMoney(tips)}`
    );
    goToEmployeeSelection();
});

const employees = [
    
    {
        name: "David Montaño",
        role: "Barman de primeira",
        outlet: "Sky Bar"
    },
    {
        name: "José Ferro",
        role: "Chefe de bar",
        outlet: "Sky Bar"
    },
    {
        name: "Marilia Campos",
        role: "Hostess",
        outlet: "Sky Bar"
    },
    {
        name: "João Martins",
        role: "Barman de segunda",
        outlet: "Sky Bar"
    },
    {
        name: "Clebinho Show",
        role: "Empregado de mesa de segunda",
        outlet: "Sky Bar"
    },
    {
        name: "Ines Pereira",
        role: "Empregada de mesa de primeira",
        outlet: "Sky Bar"
    },
    {
        name: "Paulo Roberto",
        role: "Empregado de mesa de segunda",
        outlet: "Sky Bar"
    },

    {
        name: "Alberto Pereira",
        role: "Chefe de bar",
        outlet: "Wine Bar 1638"
    },
    {
        name: "Jorge Silva",
        role: "Sommelier",
        outlet: "Wine Bar 1638"
    },
    {
        name: "Filipe Costa",
        role: "Barman de primeira",
        outlet: "Wine Bar 1638"
    },
    {
        name: "Marta Rodrigues",
        role: "Barman de segunda",
        outlet: "Wine Bar 1638"
    },
    {
        name: "Tony Montana",
        role: "Empregado de mesa de primeira",
        outlet: "Wine Bar 1638"
    },
    {
        name: "Nacho Lopez",
        role: "Empregado de mesa de segunda",
        outlet: "Wine Bar 1638"
    },

    {
        name: "Moisés Caicedo",
        role: "Barman de primeira",
        outlet: "Wine & Jazz"
    },
    {
        name: "Marisa Monteiro",
        role: "Barman de segunda",
        outlet: "Wine & Jazz"
    },
    {
        name: "Josildo Ferreira",
        role: "Sommelier",
        outlet: "Wine & Jazz"
    },
    {
        name: "Nicole Dias",
        role: "Empregado de mesa de primeira",
        outlet: "Wine & Jazz"
    },
    {
        name: "Lucas Alves",
        role: "Empregado de mesa de segunda",
        outlet: "Wine & Jazz"
    },
    {
        name: "Monica Silva",
        role: "Hostess",
        outlet: "Wine & Jazz"
    },

    {
        name: "Vasco Martins",
        role: "Barman de primeira",
        outlet: "Pool Bar"
    },
    {
        name: "Hugo Costa",
        role: "Barman de segunda",
        outlet: "Pool Bar"
    },
    {
        name: "Marco Silva",
        role: "Barman de segunda",
        outlet: "Pool Bar"
    },
    {
        name: "Leonor Sousa",
        role: "Empregada de mesa de primeira",
        outlet: "Pool Bar"
    },
    {
        name: "Rita Fernandes",
        role: "Hostess",
        outlet: "Pool Bar"
    },

    {
        name: "António Pereira",
        role: "Chefe de sala",
        outlet: "Restaurante 1638"
    },
    {
        name: "Fábio Martins",
        role: "Subchefe de sala",
        outlet: "Restaurante 1638"
    },
    {
        name: "Tomás Silva",
        role: "Empregado de mesa de primeira",
        outlet: "Restaurante 1638"
    },
    {
        name: "Rodrigo Costa",
        role: "Empregado de mesa de primeira",
        outlet: "Restaurante 1638"
    },
    {
        name: "Marta Almeida",
        role: "Empregada de mesa de segunda",
        outlet: "Restaurante 1638"
    },
    {
        name: "Joana Ferreira",
        role: "Empregada de mesa de segunda",
        outlet: "Restaurante 1638"
    },
    {
        name: "Nuno Lopes",
        role: "Sommelier",
        outlet: "Restaurante 1638"
    },

    {
    name: "Ricardo Santos",
    role: "Chefe de sala",
    outlet: "Restaurante Boa Vista"
    },
    {
        name: "Filipe Carvalho",
        role: "Subchefe de sala",
        outlet: "Restaurante Boa Vista"
    },
    {
        name: "Luís Oliveira",
        role: "Empregado de mesa de primeira",
        outlet: "Restaurante Boa Vista"
    },
    {
        name: "André Martins",
        role: "Empregado de mesa de segunda",
        outlet: "Restaurante Boa Vista"
    },
    {
        name: "Mariana Costa",
        role: "Empregada de mesa de primeira",
        outlet: "Restaurante Boa Vista"
    },
    {
        name: "Beatriz Lopes",
        role: "Hostess",
        outlet: "Restaurante Boa Vista"
    },

    {
        name: "Carlos Mendes",
        role: "Chefe de cozinha",
        outlet: "Cozinha 1638"
    },
    {
        name: "João Pereira",
        role: "Subchefe de cozinha",
        outlet: "Cozinha 1638"
    },
    {
        name: "Diogo Silva",
        role: "Cozinheiro de primeira",
        outlet: "Cozinha 1638"
    },
    {
        name: "Bruno Martins",
        role: "Cozinheiro de primeira",
        outlet: "Cozinha 1638"
    },
    {
        name: "Pedro Costa",
        role: "Cozinheiro de segunda",
        outlet: "Cozinha 1638"
    },
    {
        name: "Rafael Almeida",
        role: "Cozinheiro de segunda",
        outlet: "Cozinha 1638"
    },

    {
        name: "Miguel Ferreira",
        role: "Chefe de cozinha",
        outlet: "Cozinha Central (Boa Vista)"
    },
    {
        name: "André Lopes",
        role: "Subchefe de cozinha",
        outlet: "Cozinha Central (Boa Vista)"
    },
    {
        name: "Tiago Santos",
        role: "Cozinheiro de primeira",
        outlet: "Cozinha Central (Boa Vista)"
    },
    {
        name: "Gonçalo Martins",
        role: "Cozinheiro de primeira",
        outlet: "Cozinha Central (Boa Vista)"
    },
    {
        name: "Hugo Pereira",
        role: "Cozinheiro de segunda",
        outlet: "Cozinha Central (Boa Vista)"
    },
    {
        name: "Marco Oliveira",
        role: "Cozinheiro de segunda",
        outlet: "Cozinha Central (Boa Vista)"
    },

    {
        name: "Ana Martins",
        role: "Empregada de andares",
        outlet: "Housekeeping"
    },
    {
        name: "Carla Silva",
        role: "Empregada de andares",
        outlet: "Housekeeping"
    },
    {
        name: "Patrícia Costa",
        role: "Empregada de andares",
        outlet: "Housekeeping"
    },
    {
        name: "Sandra Ferreira",
        role: "Empregada de andares",
        outlet: "Housekeeping"
    },
    {
        name: "Daniela Santos",
        role: "Empregada de andares",
        outlet: "Housekeeping"
    },
    {
        name: "Helena Almeida",
        role: "Empregada de andares",
        outlet: "Housekeeping"
    },

    {
        name: "Vasco Pereira",
        role: "Chefe de sala",
        outlet: "Eventos"
    },
    {
        name: "João Costa",
        role: "Barman de primeira",
        outlet: "Eventos"
    },
    {
        name: "Ricardo Martins",
        role: "Barman de segunda",
        outlet: "Eventos"
    },
    {
        name: "Tiago Silva",
        role: "Empregado de mesa de primeira",
        outlet: "Eventos"
    },
    {
        name: "Pedro Almeida",
        role: "Empregado de mesa de primeira",
        outlet: "Eventos"
    },
    {
        name: "André Santos",
        role: "Empregado de mesa de segunda",
        outlet: "Eventos"
    },
    {
        name: "Inês Costa",
        role: "Hostess",
        outlet: "Eventos"
    },
    {
        name: "Bruno Ferreira",
        role: "Cozinheiro de primeira",
        outlet: "Eventos"
    }
];

/* EMPLOYEE SELECTION */

const selectedOutlets = [...new Set(employees.map((employee) => {
    return employee.outlet;
}))];

const outletList = document.querySelector("#outlet-list");
const employeeList = document.querySelector("#employee-list");

let selectedEmployees = [];
let selectedOutlet = null;

/* EMPLOYEE PANEL */

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

employeeError.classList.add("employee-error");

employeePanel.appendChild(employeeError);

continueEmployeesButton.addEventListener("click", () => {
    if (selectedEmployees.length === 0) {
        employeeError.classList.add("visible");
        return;
    }
    employeeError.classList.remove("visible");
    console.log("Selected employees:", selectedEmployees);
});

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
selectAllButton.addEventListener("click", () => {

    const visibleEmployees = getVisibleEmployees();

    const allSelected = visibleEmployees.every((employee) => {
        return selectedEmployees.includes(employee);
    });

    if (allSelected) {
        selectedEmployees = selectedEmployees.filter((employee) => {
            return !visibleEmployees.includes(employee);
        });
    } else {
        visibleEmployees.forEach((employee) => {
            if (!selectedEmployees.includes(employee)) {
                selectedEmployees.push(employee);
            }
        });
    }
    updateSelectedCount();
    employeeError.classList.remove("visible");
    renderEmployees(visibleEmployees);
});

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
    employeeList.innerHTML = "";
    employeeList.classList.toggle("scrollable", selectedOutlet === null);
    employeeArray.forEach((employee) => {

        const employeeElement = document.createElement("div");

        employeeElement.classList.add("employee");

        const isSelected = selectedEmployees.includes(employee);

        if (isSelected) {
            employeeElement.classList.add("selected");
        }

        const employeeName = document.createElement("span");

        employeeName.textContent = employee.name;

        const employeeRole = document.createElement("span");

        employeeRole.textContent = employee.role;
        employeeElement.appendChild(employeeName);
        employeeElement.appendChild(employeeRole);
        employeeElement.addEventListener("click", () => {

            const isSelected = selectedEmployees.includes(employee);

            if (isSelected) {
                selectedEmployees = selectedEmployees.filter((selectedEmployee) => {
                    return selectedEmployee !== employee;
                });
            } else {
                selectedEmployees.push(employee);
            }
            employeeError.classList.remove("visible");
            const nowSelected = selectedEmployees.includes(employee);

            employeeElement.classList.toggle("selected", nowSelected);
            updateSelectedCount();
            console.log("Selected employees:", selectedEmployees);
        });
        employeeList.appendChild(employeeElement);
    });
    updateSelectedCount();
}

/* OUTLET FILTER */

selectedOutlets.forEach((outlet) => {

    const button = document.createElement("button");

    button.textContent = outlet;
    button.addEventListener("click", () => {
        outletList.querySelectorAll("button").forEach((button) => {
            button.classList.remove("active");
        });
        button.classList.add("active");
        selectedOutlet = outlet;

        const filteredEmployees = employees.filter((employee) => {
            return employee.outlet === outlet;
        });
        console.log("Selected outlet:", outlet);
        console.log("Employees:", filteredEmployees);
        console.log("Count:", filteredEmployees.length);
        renderEmployees(filteredEmployees);
    });
    outletList.appendChild(button);
});