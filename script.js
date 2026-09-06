/* =========================
   LOADING SCREEN
========================= */

const loadingScreen = document.querySelector(".loading-screen");
const loadingBar = document.querySelector(".loader-bar");
const loadingPercentage = document.querySelector("#loading-percentage");
const app = document.querySelector(".app");

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


/* =========================
   PERIOD PICKER
========================= */

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


/* =========================
   PERIOD STATE
========================= */

let isPeriodPickerOpen = false;

let pickerYearValue = new Date().getFullYear();

let selectedYear = null;
let selectedMonth = null;

pickerYear.textContent = pickerYearValue;


/* =========================
   OPEN / CLOSE PICKER
========================= */

periodSelector.addEventListener("click", () => {

    isPeriodPickerOpen = !isPeriodPickerOpen;

    periodPicker.style.display =
        isPeriodPickerOpen ? "block" : "none";

    periodArrow.textContent =
        isPeriodPickerOpen ? "×" : "↓";

});


/* =========================
   YEAR NAVIGATION
========================= */

previousYear.addEventListener("click", () => {

    pickerYearValue--;

    pickerYear.textContent = pickerYearValue;

});


nextYear.addEventListener("click", () => {

    pickerYearValue++;

    pickerYear.textContent = pickerYearValue;

});


/* =========================
   MONTH SELECTION
========================= */

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


/* =========================
   PERIOD VALIDATION
========================= */

function clearPeriodError() {

    periodError.textContent = "";
    periodError.classList.remove("visible");

    periodField.classList.remove("has-error");

}


/* =========================
   MONEY FORMAT
========================= */

function formatMoney(value) {

    return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);

}


/* =========================
   CALCULATION FORM
========================= */

const calculationForm = document.querySelector(".calculation-form");
const tipsInput = document.querySelector("#tips");
const tipsError = document.querySelector("#tips-error");
const tipsField = tipsInput.closest(".form-field");


/* =========================
   FORM SUBMISSION
========================= */

calculationForm.addEventListener("submit", (event) => {

    event.preventDefault();

    let isValid = true;

    /* Clear previous errors */

    clearPeriodError();

    tipsError.textContent = "";
    tipsError.classList.remove("visible");

    tipsField.classList.remove("has-error");


    /* Validate period */

    if (selectedMonth === null || selectedYear === null) {

        periodError.textContent =
            "Please select a period.";

        periodError.classList.add("visible");

        periodField.classList.add("has-error");

        isValid = false;
    }


    /* Validate tips */

    const tips = Number(tipsInput.value);

    if (!tips || tips <= 0) {

        tipsError.textContent =
            "Enter a valid tips amount.";

        tipsError.classList.add("visible");

        tipsField.classList.add("has-error");

        isValid = false;
    }


    /* Stop if validation fails */

    if (!isValid) {
        return;
    }


    /* Valid data */

    console.log(
        "Period:",
        `${selectedYear}-${selectedMonth + 1}`
    );

    console.log(
        "Total Tips:",
        `€ ${formatMoney(tips)}`
    );

});