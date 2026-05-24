document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    const capybara = document.getElementById('capybara');
    capybara.classList.remove('jumping');
    void capybara.offsetWidth;
    capybara.classList.add('jumping');
  }
});

/* Windows 3.11 Calculator */
const CalcState = {
  display: '0',
  accumulator: null,
  currentOp: null,
  newNumber: true,
  decimalUsed: false,
};

function updateDisplay() {
  const display = document.getElementById('calc-display');
  if (display) {
    display.value = CalcState.display;
  }
}

function handleNumber(val) {
  if (val === '.' && CalcState.decimalUsed) return;
  if (val === '.' && CalcState.newNumber) {
    CalcState.display = '0.';
    CalcState.decimalUsed = true;
    CalcState.newNumber = false;
  } else if (CalcState.newNumber) {
    CalcState.display = val;
    CalcState.newNumber = false;
    CalcState.decimalUsed = val === '.';
  } else {
    CalcState.display += val;
    if (val === '.') CalcState.decimalUsed = true;
  }
  updateDisplay();
}

function handleOperation(op) {
  const num = parseFloat(CalcState.display);

  if (CalcState.currentOp !== null && !CalcState.newNumber) {
    const result = calculate(CalcState.accumulator, num, CalcState.currentOp);
    CalcState.display = String(result);
    CalcState.accumulator = result;
  } else {
    CalcState.accumulator = num;
  }

  CalcState.currentOp = op;
  CalcState.newNumber = true;
  CalcState.decimalUsed = false;
  updateDisplay();
}

function calculate(a, b, op) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b === 0 ? 0 : a / b;
    default: return b;
  }
}

function handleEquals() {
  if (CalcState.currentOp === null) return;
  const num = parseFloat(CalcState.display);
  const result = calculate(CalcState.accumulator, num, CalcState.currentOp);
  CalcState.display = String(result);
  CalcState.accumulator = null;
  CalcState.currentOp = null;
  CalcState.newNumber = true;
  CalcState.decimalUsed = false;
  updateDisplay();
}

document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('.win311-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.val;
      const op = btn.dataset.op;

      if (val) {
        handleNumber(val);
      } else if (op === '=') {
        handleEquals();
      } else if (op) {
        handleOperation(op);
      }
    });
  });
});
