// OrderCo - Full Stack Restaurant Voting & Ordering System
// Frontend Application with localStorage and API integration

class OrderCoApp {
    constructor() {
        // Use configuration from config.js
        this.apiBaseUrl = CONFIG.API_BASE_URL;
        this.applicantId = null;
        this.applicantName = null;
        this.selectedRestaurantId = null;
        this.currentOrder = {};
        this.isAdmin = false;
        this.votingEndTime = null;
        this.votingTimerInterval = null;
        this.restaurantVoted = false;
        this.restaurants = [];

        this.init();
    }

    async init() {
        this.loadFromLocalStorage();
        this.attachEventListeners();
        await this.determinePage();
        this.hideLoadingState();
    }

    // ===== localStorage Methods =====
    loadFromLocalStorage() {
        const stored = localStorage.getItem('applicantData');
        if (stored) {
            const data = JSON.parse(stored);
            this.applicantId = data.applicantId;
            this.applicantName = data.applicantName;
            this.restaurantVoted = data.restaurantVoted || false;
            this.selectedRestaurantId = data.selectedRestaurantId;
            this.currentOrder = data.currentOrder || {};
        }

        // Check for persistent admin login
        const adminToken = localStorage.getItem('adminToken');
        if (adminToken) {
            this.isAdmin = true;
        }
    }

    saveToLocalStorage() {
        const data = {
            applicantId: this.applicantId,
            applicantName: this.applicantName,
            restaurantVoted: this.restaurantVoted,
            selectedRestaurantId: this.selectedRestaurantId,
            currentOrder: this.currentOrder
        };
        localStorage.setItem('applicantData', JSON.stringify(data));
    }

    clearLocalStorage() {
        localStorage.removeItem('applicantData');
        localStorage.removeItem('adminToken');
    }

    // ===== Page Navigation =====
    async determinePage() {
        const pages = document.querySelectorAll('.page');
        pages.forEach(p => p.classList.add('hidden'));

        if (this.isAdmin) {
            this.showPage('adminDashboardPage');
            this.loadAdminDashboard();
            return;
        }

        if (!this.applicantId) {
            this.showPage('landingPage');
            return;
        }

        // User is registered, check server state
        const selectedRestaurantResult = await this.apiCall('/admin/selected-restaurant');
        const liveSelectedRestaurantId = selectedRestaurantResult ? selectedRestaurantResult.restaurantId : null;

        const submittedOrder = localStorage.getItem('submittedOrderData');
        if (submittedOrder) {
            const orderData = JSON.parse(submittedOrder);
            if (orderData.restaurantId === liveSelectedRestaurantId && liveSelectedRestaurantId !== null) {
                // Order is still valid, show confirmation.
                this.displayOrderConfirmation(orderData);
                this.showPage('orderConfirmationPage');
                return;
            } else {
                // Order is stale (new vote started, or admin changed selection)
                // Clear old data and proceed to re-evaluate user state.
                localStorage.removeItem('submittedOrderData');
                this.currentOrder = {};
                this.restaurantVoted = false; // Reset voting status
                this.selectedRestaurantId = null;
                this.saveToLocalStorage();
            }
        }

        // If we are here, there is no valid submitted order.
        // Update local state with fresh data from server before making decisions.
        this.selectedRestaurantId = liveSelectedRestaurantId;
        this.saveToLocalStorage();

        if (!this.restaurantVoted) {
            this.showPage('votingPage');
            this.loadVotingPage();
        } else if (!this.selectedRestaurantId) {
            this.showPage('restaurantSelectedPage');
            this.checkSelectedRestaurant(); // This will show a waiting message
        } else {
            // User has voted and a restaurant is selected
            this.showPage('orderPage');
            this.loadOrderPage();
        }
    }

    showPage(pageId) {
        document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
        const page = document.getElementById(pageId);
        if (page) {
            page.classList.remove('hidden');
        }
    }

    hideLoadingState() {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('pages').classList.remove('hidden');
    }

    // ===== API Methods =====
    async apiCall(endpoint, method = 'GET', body = null) {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}${endpoint}`, options);
            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            return null;
        }
    }

    // ===== Registration =====
    attachEventListeners() {
        // Landing Page
        document.getElementById('registrationForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRegistration();
        });

        // Voting Page
        document.getElementById('skipVotingBtn')?.addEventListener('click', () => {
            this.skipVoting();
        });

        // Restaurant Selected Page
        document.getElementById('proceedToOrderBtn')?.addEventListener('click', () => {
            this.showPage('orderPage');
            this.loadOrderPage();
        });

        document.getElementById('viewVotesBtn')?.addEventListener('click', () => {
            this.showPage('votingResultsPage');
            this.loadVotingResults();
        });

        // Voting Results
        document.getElementById('backToOrderBtn')?.addEventListener('click', () => {
            this.showPage('restaurantSelectedPage');
        });

        // Order Page
        document.getElementById('submitOrderBtn')?.addEventListener('click', () => {
            this.submitOrder();
        });

        // Order Confirmation
        document.getElementById('viewAdminBtn')?.addEventListener('click', () => {
            this.goToAdmin();
        });

        document.getElementById('newOrderBtn')?.addEventListener('click', () => {
            localStorage.removeItem('submittedOrderData');
            this.currentOrder = {};
            this.saveToLocalStorage();
            this.showPage('votingPage');
            this.loadVotingPage();
        });

        // Admin
        document.getElementById('adminLoginForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAdminLogin();
        });

        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            this.handleAdminLogout();
        });

        // Admin Tabs
        document.getElementById('votesTab')?.addEventListener('click', () => {
            this.switchAdminTab('votes');
            this.loadAdminVotingResults();
        });

        document.getElementById('ordersTab')?.addEventListener('click', () => {
            this.switchAdminTab('orders');
            this.loadAdminOrders();
        });

        document.getElementById('restaurantsTab')?.addEventListener('click', () => {
            this.switchAdminTab('restaurants');
            this.loadRestaurantManagement();
        });

        // Restaurant Management Form
        document.getElementById('addRestaurantForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleCreateRestaurant();
        });

        // Menu Item Modal Form
        document.getElementById('addMenuItemForm')?.addEventListener('submit', (e) => {
            this.handleMenuItemFormSubmit(e);
        });

    }

    async handleRegistration() {
        const name = document.getElementById('applicantName').value.trim();
        if (!name) return;

        const result = await this.apiCall('/applicant/register', 'POST', { name });
        if (result) {
            this.applicantId = result.id;
            this.applicantName = name;
            this.saveToLocalStorage();
            document.getElementById('welcomeName').textContent = this.applicantName;
            this.showPage('votingPage');
            this.loadVotingPage();
        }
    }

    // ===== Voting =====
    async loadVotingPage() {
        document.getElementById('welcomeName').textContent = this.applicantName;
        
        const restaurants = await this.apiCall('/restaurant/all');
        const votingStatus = await this.apiCall('/vote/status');

        if (votingStatus) {
            this.votingEndTime = new Date(votingStatus.endTime);
            this.startVotingTimer();
        }

        if (restaurants) {
            this.displayRestaurants(restaurants);
        }
    }

    displayRestaurants(restaurants) {
        const container = document.getElementById('restaurantList');
        container.innerHTML = '';

        restaurants.forEach(restaurant => {
            const bestDish = restaurant.menu.find(item => item.isBestDish);
            const menuHtml = restaurant.menu.map(item => {
                if (item.isBestDish) {
                    return `
                        <div class="flex justify-between items-center py-3 px-3 bg-yellow-50 rounded border-l-4 border-yellow-400">
                            <span class="font-semibold text-gray-800">⭐ ${item.name}</span>
                            <span class="text-yellow-600 font-bold">£${item.price.toFixed(2)}</span>
                        </div>
                    `;
                }
                return `
                    <div class="flex justify-between items-center py-2 px-3 bg-gray-50 rounded">
                        <span class="text-gray-700">${item.name}</span>
                        <span class="text-indigo-600 font-bold">£${item.price.toFixed(2)}</span>
                    </div>
                `;
            }).join('');

            const hasBestDish = bestDish ? 'has-best-dish' : '';
            const restaurantCard = document.createElement('div');
            restaurantCard.className = `restaurant-card bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition transform hover:scale-105 fade-in ${hasBestDish}`;
            restaurantCard.innerHTML = `
                ${bestDish ? '<div class="best-dish-star">⭐</div>' : ''}
                <div class="p-6 pb-4 flex-grow">
                    <h3 class="text-2xl font-bold text-gray-800 mb-2">${restaurant.name}</h3>
                    <p class="text-gray-600 mb-4 text-sm">${restaurant.description}</p>
                    
                    <div class="mb-5">
                        <h4 class="font-bold text-gray-700 mb-3 text-sm uppercase tracking-wide">Menu Items:</h4>
                        <div class="space-y-2">
                            ${menuHtml}
                        </div>
                    </div>

                    <div class="flex items-center gap-2 mb-5 pt-3 border-t">
                        <span class="vote-count-badge">${restaurant.voteCount}</span>
                        <span class="text-sm text-gray-600">vote${restaurant.voteCount !== 1 ? 's' : ''}</span>
                    </div>
                </div>

                <div class="px-6 pb-6">
                    <button
                        class="vote-btn w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold py-3 rounded-lg transition transform hover:scale-105 shadow-md"
                        data-restaurant-id="${restaurant.id}"
                    >
                        Vote Now
                    </button>
                </div>
            `;

            container.appendChild(restaurantCard);
        });

        // Attach vote button listeners
        document.querySelectorAll('.vote-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const restaurantId = parseInt(btn.dataset.restaurantId);
                this.submitVote(restaurantId);
            });
        });
    }

    startVotingTimer() {
        if (this.votingTimerInterval) clearInterval(this.votingTimerInterval);

        const updateTimer = () => {
            const now = new Date();
            const diff = this.votingEndTime - now;

            if (diff <= 0) {
                document.getElementById('votingTimer').textContent = '00:00';
                clearInterval(this.votingTimerInterval);
                this.votingEnded();
            } else {
                const minutes = Math.floor(diff / 60000);
                const seconds = Math.floor((diff % 60000) / 1000);
                document.getElementById('votingTimer').textContent = 
                    `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            }
        };

        updateTimer();
        this.votingTimerInterval = setInterval(updateTimer, 1000);
    }

    async submitVote(restaurantId) {
        const result = await this.apiCall('/vote/submit', 'POST', {
            applicantId: this.applicantId,
            restaurantId: restaurantId
        });

        if (result) {
            this.restaurantVoted = true;
            this.saveToLocalStorage();
            alert(`✓ You voted for restaurant ${restaurantId}!`);
            this.checkSelectedRestaurant();
        }
    }

    skipVoting() {
        this.restaurantVoted = true;
        this.saveToLocalStorage();
        this.checkSelectedRestaurant();
    }

    async checkSelectedRestaurant() {
        const selected = await this.apiCall('/admin/selected-restaurant');
        
        if (selected && selected.restaurantId) {
            this.selectedRestaurantId = selected.restaurantId;
            this.saveToLocalStorage();
            const restaurant = await this.apiCall(`/restaurant/${selected.restaurantId}`);
            if (restaurant) {
                this.displaySelectedRestaurant(restaurant);
                this.showPage('restaurantSelectedPage');
            }
        } else {
            // Wait for admin to select
            this.showPage('restaurantSelectedPage');
            this.displayWaitingMessage();
            setTimeout(() => this.checkSelectedRestaurant(), 2000);
        }
    }

    displaySelectedRestaurant(restaurant) {
        const container = document.getElementById('selectedRestaurantInfo');
        const bestDish = restaurant.menu.find(item => item.isBestDish);
        
        container.innerHTML = `
            <h2 class="text-3xl font-bold text-indigo-600 mb-4">${restaurant.name}</h2>
            <p class="text-gray-600 mb-4">${restaurant.description}</p>
            ${bestDish ? `<p class="text-amber-600 font-bold mb-2">⭐ Signature Dish: ${bestDish.name}</p>` : ''}
        `;
    }

    displayWaitingMessage() {
        const container = document.getElementById('selectedRestaurantInfo');
        container.innerHTML = `
            <div class="text-center py-8">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                <p class="text-gray-600">Waiting for admin to select a restaurant...</p>
            </div>
        `;
    }

    async loadVotingResults() {
        const results = await this.apiCall('/vote/results');
        if (!results) return;

        const container = document.getElementById('votingResultsList');
        container.innerHTML = '';

        // Sort by vote count
        const sorted = [...results].sort((a, b) => b.voteCount - a.voteCount);

        sorted.forEach((restaurant, index) => {
            const card = document.createElement('div');
            card.className = 'bg-white rounded-lg shadow p-6 border-l-4 border-indigo-600';
            card.innerHTML = `
                <div class="flex justify-between items-center">
                    <div>
                        <h3 class="text-xl font-bold text-gray-800">
                            ${index === 0 ? '🏆 ' : ''} ${restaurant.name}
                        </h3>
                        <p class="text-gray-600">${restaurant.description}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-3xl font-bold text-indigo-600">${restaurant.voteCount}</p>
                        <p class="text-sm text-gray-600">votes</p>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    votingEnded() {
        alert('Voting has ended! Admin will now select the restaurant.');
    }

    // ===== Ordering =====
    async loadOrderPage() {
        const restaurant = await this.apiCall(`/restaurant/${this.selectedRestaurantId}`);
        if (!restaurant) return;

        const container = document.getElementById('menuItems');
        container.innerHTML = '';

        restaurant.menu.forEach(item => {
            const itemCard = document.createElement('div');
            itemCard.className = 'bg-white rounded-lg shadow p-6 flex justify-between items-center hover:shadow-lg transition fade-in';
            
            const isBest = item.isBestDish ? '⭐ ' : '';
            const bestClass = item.isBestDish ? 'border-l-4 border-amber-400' : '';
            const existingOrderItem = this.currentOrder[item.id];
            const quantity = existingOrderItem ? existingOrderItem.quantity : 0;

            itemCard.innerHTML = `
                <div class="flex-1 ${bestClass} pl-4">
                    <h4 class="text-lg font-bold text-gray-800">${isBest}${item.name}</h4>
                    <p class="text-gray-600 text-sm">${item.description}</p>
                    <p class="text-indigo-600 font-bold text-lg mt-2">£${item.price.toFixed(2)}</p>
                </div>
                <div class="flex items-center gap-3">
                    <input
                        type="number"
                        min="0"
                        max="10"
                        value="${quantity}"
                        class="quantity-input w-16 px-2 py-1 border border-gray-300 rounded text-center"
                        data-item-id="${item.id}"
                        data-item-name="${item.name}"
                        data-item-price="${item.price}"
                    />
                </div>
            `;

            container.appendChild(itemCard);

            // Attach quantity change listener
            itemCard.querySelector('.quantity-input').addEventListener('change', () => {
                this.updateOrderSummary();
            });
        });
        this.updateOrderSummary();
    }

    updateOrderSummary() {
        this.currentOrder = {};
        let totalPrice = 0;

        document.querySelectorAll('.quantity-input').forEach(input => {
            const qty = parseInt(input.value) || 0;
            if (qty > 0) {
                const itemId = parseInt(input.dataset.itemId);
                const itemName = input.dataset.itemName;
                const itemPrice = parseFloat(input.dataset.itemPrice);

                this.currentOrder[itemId] = {
                    itemId,
                    menuItemName: itemName,
                    price: itemPrice,
                    quantity: qty,
                    subTotal: itemPrice * qty
                };

                totalPrice += itemPrice * qty;
            }
        });

        // Update summary display
        const summaryContainer = document.getElementById('orderSummary');
        summaryContainer.innerHTML = '';

        Object.values(this.currentOrder).forEach(item => {
            const summaryItem = document.createElement('div');
            summaryItem.className = 'flex justify-between items-center text-sm';
            summaryItem.innerHTML = `
                <span>${item.menuItemName} x${item.quantity}</span>
                <span class="font-bold">£${item.subTotal.toFixed(2)}</span>
            `;
            summaryContainer.appendChild(summaryItem);
        });

        document.getElementById('totalPrice').textContent = `£${totalPrice.toFixed(2)}`;
    }

    async submitOrder() {
        if (Object.keys(this.currentOrder).length === 0) {
            alert('Please select at least one item');
            return;
        }

        const items = Object.values(this.currentOrder);
        const orderData = {
            applicantId: this.applicantId,
            restaurantId: this.selectedRestaurantId,
            items: items
        };

        const result = await this.apiCall('/order/submit', 'POST', orderData);
        if (result) {
            localStorage.setItem('submittedOrderData', JSON.stringify(result));
            this.displayOrderConfirmation(result);
            this.showPage('orderConfirmationPage');
        }
    }

    displayOrderConfirmation(order) {
        const detailsDiv = document.getElementById('orderConfirmationDetails');
        const itemsHtml = order.items.map(item => `
            <tr class="border-t">
                <td class="py-2">${item.menuItemName}</td>
                <td class="py-2 font-bold">x${item.quantity}</td>
                <td class="py-2 text-right font-bold">£${item.subTotal.toFixed(2)}</td>
            </tr>
        `).join('');

        detailsDiv.innerHTML = `
            <p class="mb-3"><strong>Order ID:</strong> #${order.id}</p>
            <p class="mb-3"><strong>Applicant:</strong> ${order.applicantName}</p>
            <table class="w-full text-sm">
                <thead class="border-b-2">
                    <tr>
                        <th class="text-left py-2">Item</th>
                        <th class="text-left py-2">Qty</th>
                        <th class="text-right py-2">Price</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>
            <div class="border-t-2 mt-4 pt-4 text-right">
                <p class="text-lg font-bold">Total: <span class="text-indigo-600">$${order.totalCost.toFixed(2)}</span></p>
            </div>
        `;
    }

    // ===== Admin =====
    goToAdmin() {
        this.showPage('adminLoginPage');
    }

    async handleAdminLogin() {
        const password = document.getElementById('adminPassword').value;
        const result = await this.apiCall('/admin/login', 'POST', { password });

        if (result && result.token) {
            this.isAdmin = true;
            localStorage.setItem('adminToken', result.token);
            this.showPage('adminDashboardPage');
            this.loadAdminDashboard();
        } else {
            document.getElementById('loginError').textContent = 'Invalid password';
            document.getElementById('loginError').classList.remove('hidden');
        }
    }

    handleAdminLogout() {
        this.isAdmin = false;
        localStorage.removeItem('adminToken');
        this.clearLocalStorage();
        window.location.reload();
    }

    async loadAdminDashboard() {
        // Load stats
        const orders = await this.apiCall('/order/all');
        const revenueData = await this.apiCall('/order/revenue');
        const selected = await this.apiCall('/restaurant/selected-winner');

        document.getElementById('totalOrdersCount').textContent = orders ? orders.length : 0;
        document.getElementById('totalRevenueAmount').textContent = 
            `£${revenueData ? revenueData.totalRevenue.toFixed(2) : '0.00'}`;

        if (selected && selected.name) {
            document.getElementById('selectedRestaurantName').textContent = selected.name;
        } else {
            document.getElementById('selectedRestaurantName').textContent = 'Pending';
        }

        // Load voting results
        await this.loadAdminVotingResults();

        // Load orders
        await this.loadAdminOrders();
    }

    async loadAdminVotingResults() {
        const results = await this.apiCall('/vote/results');
        const selected = await this.apiCall('/restaurant/selected-winner');
        const selectedRestaurantId = selected ? selected.id : null;
        
        if (!results) return;

        const container = document.getElementById('adminVotingResults');
        container.innerHTML = '';

        const sorted = [...results].sort((a, b) => b.voteCount - a.voteCount);

        sorted.forEach(restaurant => {
            const isSelected = selectedRestaurantId === restaurant.id;
            const resultCard = document.createElement('div');
            const cardClasses = isSelected 
                ? 'flex justify-between items-center p-4 bg-green-50 rounded-lg border-2 border-green-500 hover:bg-green-100 transition'
                : 'flex justify-between items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition';
            
            resultCard.className = cardClasses;
            resultCard.innerHTML = `
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <h4 class="font-bold text-gray-800">${restaurant.name}</h4>
                        ${isSelected ? '<span class="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded-full">✓ SELECTED</span>' : ''}
                    </div>
                    <p class="text-sm text-gray-600">${restaurant.description}</p>
                </div>
                <div class="text-right mr-4">
                    <p class="text-3xl font-bold text-indigo-600">${restaurant.voteCount}</p>
                    <p class="text-xs text-gray-600">votes</p>
                </div>
                <button
                    class="select-restaurant-btn px-4 py-2 ${isSelected ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'} text-white rounded transition"
                    data-restaurant-id="${restaurant.id}"
                    ${isSelected ? 'disabled' : ''}
                >
                    ${isSelected ? 'Selected ✓' : 'Select'}
                </button>
            `;

            container.appendChild(resultCard);

            if (!isSelected) {
                resultCard.querySelector('.select-restaurant-btn').addEventListener('click', async () => {
                    const selectBtn = resultCard.querySelector('.select-restaurant-btn');
                    selectBtn.disabled = true;
                    selectBtn.textContent = 'Selecting...';
                    
                    const result = await this.apiCall(`/restaurant/select-winner/${restaurant.id}`, 'POST');
                    if (result) {
                        alert(`✓ Restaurant ${restaurant.name} selected!`);
                        // Reload dashboard to show selected restaurant and update all data
                        await this.loadAdminDashboard();
                    } else {
                        alert('Failed to select restaurant');
                        selectBtn.disabled = false;
                        selectBtn.textContent = 'Select';
                    }
                });
            }
        });
    }

    async loadAdminOrders() {
        const aggregatedOrders = await this.apiCall('/admin/orders/aggregated');
        if (!aggregatedOrders) return;

        const container = document.getElementById('adminOrdersList');
        container.innerHTML = '';

        aggregatedOrders.forEach(aggOrder => {
            const aggregatedOrderCard = document.createElement('div');
            aggregatedOrderCard.className = 'p-6 bg-white rounded-lg shadow-md mb-6 border-l-4 border-purple-600';

            const aggregatedItemsHtml = aggOrder.items.map(item => `
                <li class="flex items-center text-sm text-gray-700 py-1">
                    <span class="w-3/5">${item.menuItemName}</span>
                    <span class="w-1/5 text-center">x${item.quantity}</span>
                    <span class="w-1/5 text-right font-bold">£${item.subTotal.toFixed(2)}</span>
                </li>
            `).join('');

            const individualOrdersHtml = aggOrder.orders.map(order => {
                const paidAmount = order.paidAmount > 0 ? order.paidAmount.toFixed(2) : '';
                const returnAmount = order.paidAmount > 0 ? (order.paidAmount - order.totalCost).toFixed(2) : '';

                return `
                <div class="p-4 bg-gray-50 rounded-lg mt-4 border-l-4 border-indigo-400">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <h5 class="font-bold text-gray-800">Order #${order.id}</h5>
                            <p class="text-sm text-gray-600">${order.applicantName}</p>
                        </div>
                        <p class="font-bold text-indigo-600">£${order.totalCost.toFixed(2)}</p>
                    </div>
                    <ul class="mb-3">
                        ${order.items.map(item => `<li class="text-sm text-gray-600">${item.menuItemName} x${item.quantity} - £${item.subTotal.toFixed(2)}</li>`).join('')}
                    </ul>
                    <div class="mt-4 flex items-center gap-4">
                        <div class="flex-1">
                            <label for="paidAmount-${order.id}" class="block text-sm font-medium text-gray-700">Paid Amount (£)</label>
                            <input type="number" id="paidAmount-${order.id}" class="w-full px-2 py-1 border border-gray-300 rounded" placeholder="e.g., 20" value="${paidAmount}">
                        </div>
                        <div class="flex-1">
                            <label for="returnAmount-${order.id}" class="block text-sm font-medium text-gray-700">Return</label>
                            <input type="text" id="returnAmount-${order.id}" class="w-full px-2 py-1 border bg-gray-100 rounded" readonly value="${returnAmount ? '£' + returnAmount : ''}">
                        </div>
                        <button class="calculate-change-btn h-10 mt-5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm transition" data-order-id="${order.id}" data-total-cost="${order.totalCost}">
                            Calculate
                        </button>
                    </div>
                </div>
            `}).join('');

            aggregatedOrderCard.innerHTML = `
                <div class="mb-4">
                    <h3 class="text-2xl font-bold text-gray-800">${aggOrder.restaurantName}</h3>
                    <p class="text-lg font-bold text-purple-600">Total: £${aggOrder.totalCost.toFixed(2)}</p>
                </div>
                <div class="p-4 bg-purple-50 rounded-lg">
                    <h4 class="font-bold text-gray-800 mb-2">Aggregated Items</h4>
                    <ul class="space-y-1">${aggregatedItemsHtml}</ul>
                </div>
                <div class="mt-4">
                    <h4 class="font-bold text-gray-800 mb-2">Individual Orders</h4>
                    ${individualOrdersHtml}
                </div>
            `;

            container.appendChild(aggregatedOrderCard);
        });

        document.querySelectorAll('.calculate-change-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const orderId = e.target.dataset.orderId;
                const totalCost = parseFloat(e.target.dataset.totalCost);
                const paidAmountInput = document.getElementById(`paidAmount-${orderId}`);
                const paidAmount = parseFloat(paidAmountInput.value);

                if (isNaN(paidAmount) || paidAmount < totalCost) {
                    alert('Paid amount must be a number and greater than or equal to the total cost.');
                    return;
                }

                const change = paidAmount - totalCost;
                document.getElementById(`returnAmount-${orderId}`).value = `£${change.toFixed(2)}`;

                await this.apiCall(`/order/${orderId}/paid`, 'POST', { paidAmount });
                alert('Paid amount saved.');
            });
        });
    }

    switchAdminTab(tab) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('border-b-2', 'border-indigo-600', 'text-indigo-600');
            btn.classList.add('text-gray-600');
        });

        // Hide all tabs
        document.getElementById('votesTabContent').classList.add('hidden');
        document.getElementById('ordersTabContent').classList.add('hidden');
        document.getElementById('restaurantsTabContent').classList.add('hidden');

        if (tab === 'votes') {
            document.getElementById('votesTab').classList.add('border-b-2', 'border-indigo-600', 'text-indigo-600');
            document.getElementById('votesTabContent').classList.remove('hidden');
        } else if (tab === 'orders') {
            document.getElementById('ordersTab').classList.add('border-b-2', 'border-indigo-600', 'text-indigo-600');
            document.getElementById('ordersTabContent').classList.remove('hidden');
        } else if (tab === 'restaurants') {
            document.getElementById('restaurantsTab').classList.add('border-b-2', 'border-indigo-600', 'text-indigo-600');
            document.getElementById('restaurantsTabContent').classList.remove('hidden');
        }
    }

    // ===== Admin Voting Control Methods =====
    async resetVoting() {
        if (!confirm('Are you sure you want to reset voting? All votes will be cleared.')) {
            return;
        }

        const result = await this.apiCall('/Vote/reset', 'POST');
        if (result) {
            alert('Voting has been reset successfully!');
            this.loadAdminVotingResults();
        } else {
            alert('Failed to reset voting');
        }
    }

    async deleteAllVotes() {
        if (!confirm('Are you sure you want to DELETE ALL VOTES? This cannot be undone.')) {
            return;
        }

        const result = await this.apiCall('/admin/votes/delete-all', 'DELETE');
        if (result) {
            alert('All votes have been deleted successfully!');
            this.loadAdminVotingResults();
        } else {
            alert('Failed to delete votes');
        }
    }

    async createNewVoting() {
        const votingDurationStr = prompt('Enter voting duration in minutes (default: 10):', '10');
        if (votingDurationStr === null) return;

        const votingDuration = parseInt(votingDurationStr) || 10;
        const endTime = new Date(Date.now() + votingDuration * 60 * 1000);

        const result = await this.apiCall('/admin/voting/reset', 'POST', {
            votingEndTime: endTime.toISOString()
        });

        if (result) {
            alert(`New voting session created for ${votingDuration} minutes!`);
            this.loadAdminVotingResults();
        } else {
            alert('Failed to create voting session');
        }
    }

    async generateVotingLink() {
        const link = `${window.location.origin}${window.location.pathname}?voting=true`;
        alert(`Voting Link:\n\n${link}\n\nCopy this link to share with voters.`);
    }

    async loadRestaurantManagement() {
        const result = await this.apiCall('/restaurant/all', 'GET');
        this.restaurants = result;
        const list = document.getElementById('restaurantsList');
        
        if (!result || result.length === 0) {
            list.innerHTML = '<p class="text-center text-gray-500 py-8">No restaurants found. Add one to get started!</p>';
            return;
        }

        list.innerHTML = result.map(restaurant => `
            <div class="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 rounded-lg p-6 shadow hover:shadow-lg transition">
                <!-- Header -->
                <div class="flex justify-between items-start mb-4">
                    <div class="flex-1">
                        <h4 class="text-xl font-bold text-gray-800">${restaurant.name}</h4>
                        <p class="text-gray-600 text-sm">${restaurant.description}</p>
                        <p class="text-xs text-gray-500 mt-2">📊 Votes: <span class="font-bold">${restaurant.voteCount || 0}</span></p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="window.app.editRestaurant(${restaurant.id}, '${restaurant.name.replace(/'/g, "\\'")}', '${restaurant.description.replace(/'/g, "\\'")}')" 
                            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-bold">
                            ✏️ Edit
                        </button>
                        <button onclick="window.app.deleteRestaurant(${restaurant.id})" 
                            class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition font-bold">
                            🗑️ Delete
                        </button>
                    </div>
                </div>
                
                <!-- Menu Items Section -->
                <div class="mt-6 pt-6 border-t-2 border-gray-300">
                    <div class="flex justify-between items-center mb-4">
                        <h5 class="font-bold text-lg text-gray-800">🍽️ Menu Items</h5>
                        <button onclick="window.app.openMenuModal(${restaurant.id})" 
                            class="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition font-bold">
                            ➕ Add Item
                        </button>
                    </div>
                    
                    ${restaurant.menu && restaurant.menu.length > 0 ? 
                        `<div class="space-y-2 mb-4">
                            ${restaurant.menu.map(item => `
                                <div class="flex justify-between items-center bg-white p-3 rounded-lg border border-gray-200 hover:shadow-md transition">
                                    <div class="flex-1">
                                        <div class="font-bold text-gray-800">${item.name}</div>
                                        <div class="text-xs text-gray-600">${item.description || 'No description'}</div>
                                        <div class="flex items-center gap-2 mt-2">
                                            <span class="text-sm font-bold text-green-600">£${item.price.toFixed(2)}</span>
                                            ${item.isBestDish ? '<span class="text-xs bg-yellow-300 text-yellow-900 font-bold px-2 py-1 rounded">⭐ BEST DISH</span>' : ''}
                                        </div>
                                    </div>
                                    <div class="flex gap-2">
                                        <button onclick="window.app.editMenuItem(${restaurant.id}, ${item.id})"
                                            class="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs transition font-bold">
                                            Edit
                                        </button>
                                        <button onclick="window.app.deleteMenuItem(${restaurant.id}, ${item.id})" 
                                            class="px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded text-xs transition font-bold">
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>` 
                        : '<div class="text-center py-4 bg-white rounded-lg border-2 border-dashed border-gray-300"><p class="text-gray-500">No menu items yet. Add your first dish!</p></div>'
                    }
                </div>
            </div>
        `).join('');
    }

    editMenuItem(restaurantId, menuItemId) {
        const restaurant = this.restaurants.find(r => r.id === restaurantId);
        if (!restaurant) return;

        const menuItem = restaurant.menu.find(m => m.id === menuItemId);
        if (!menuItem) return;

        this.openMenuModal(restaurantId, menuItem);
    }

    openMenuModal(restaurantId, menuItem = null) {
        const modal = document.getElementById('menuModal');
        const form = document.getElementById('addMenuItemForm');
        const title = modal.querySelector('h3');
        const submitButton = form.querySelector('button[type="submit"]');

        document.getElementById('currentRestaurantId').value = restaurantId;

        if (menuItem) {
            // Edit mode
            title.textContent = 'Edit Menu Item';
            submitButton.textContent = 'Update Item';
            document.getElementById('currentMenuItemId').value = menuItem.id;
            document.getElementById('menuItemName').value = menuItem.name;
            document.getElementById('menuItemDesc').value = menuItem.description;
            document.getElementById('menuItemPrice').value = menuItem.price;
            document.getElementById('bestDishCheckbox').checked = menuItem.isBestDish;
        } else {
            // Add mode
            title.textContent = 'Add Menu Item';
            submitButton.textContent = 'Add Item';
            document.getElementById('currentMenuItemId').value = '';
            form.reset();
        }

        modal.classList.remove('hidden');
        document.getElementById('menuItemName').focus();
    }

    async handleMenuItemFormSubmit(e) {
        e.preventDefault();
        const restaurantId = parseInt(document.getElementById('currentRestaurantId').value);
        const menuItemId = parseInt(document.getElementById('currentMenuItemId').value);
        const name = document.getElementById('menuItemName').value.trim();
        const description = document.getElementById('menuItemDesc').value.trim();
        const price = parseFloat(document.getElementById('menuItemPrice').value);
        const isBestDish = document.getElementById('bestDishCheckbox').checked;

        if (!name || !description || isNaN(price) || price < 0) {
            alert('Please fill in all fields with valid values');
            return;
        }

        const data = { name, description, price, isBestDish };
        let result;

        if (menuItemId) {
            // Update
            result = await this.apiCall(`/admin/restaurant/update-menu-item/${restaurantId}/${menuItemId}`, 'PUT', data);
        } else {
            // Add
            result = await this.apiCall(`/admin/restaurant/add-menu-item/${restaurantId}`, 'POST', data);
        }

        if (result) {
            document.getElementById('menuModal').classList.add('hidden');
            this.loadRestaurantManagement();
            alert(`Menu item ${menuItemId ? 'updated' : 'added'} successfully!`);
        } else {
            alert(`Failed to ${menuItemId ? 'update' : 'add'} menu item`);
        }
    }

    async handleCreateRestaurant() {
        const name = document.getElementById('restName').value.trim();
        const description = document.getElementById('restDescription').value.trim();

        if (!name || !description) {
            alert('Please fill in all fields');
            return;
        }

        const result = await this.apiCall('/admin/restaurant/create', 'POST', { name, description });
        if (result) {
            document.getElementById('restName').value = '';
            document.getElementById('restDescription').value = '';
            alert('Restaurant created successfully!');
            this.loadRestaurantManagement();
        } else {
            alert('Failed to create restaurant');
        }
    }

    editRestaurant(id, name, description) {
        const newName = prompt('Edit restaurant name:', name);
        if (newName === null) return;

        const newDescription = prompt('Edit restaurant description:', description);
        if (newDescription === null) return;

        this.handleUpdateRestaurant(id, newName, newDescription);
    }

    async handleUpdateRestaurant(id, name, description) {
        if (!name.trim() || !description.trim()) {
            alert('Name and description cannot be empty');
            return;
        }

        const result = await this.apiCall(`/admin/restaurant/update/${id}`, 'PUT', { name, description });
        if (result) {
            alert('Restaurant updated successfully!');
            this.loadRestaurantManagement();
        } else {
            alert('Failed to update restaurant');
        }
    }

    async deleteRestaurant(id) {
        if (!confirm('Are you sure you want to delete this restaurant?')) return;

        const result = await this.apiCall(`/admin/restaurant/delete/${id}`, 'DELETE');
        if (result) {
            alert('Restaurant deleted successfully!');
            this.loadRestaurantManagement();
        } else {
            alert('Failed to delete restaurant');
        }
    }

    async handleAddMenuItem(restaurantId) {
        const nameInput = document.querySelector(`[data-item-name-${restaurantId}]`);
        const priceInput = document.querySelector(`[data-item-price-${restaurantId}]`);

        const name = nameInput.value.trim();
        const price = parseFloat(priceInput.value);

        if (!name || isNaN(price) || price <= 0) {
            alert('Please enter valid item name and price');
            return;
        }

        const result = await this.apiCall(`/admin/restaurant/add-menu-item/${restaurantId}`, 'POST', {
            name,
            description: '',
            price,
            isBestDish: false
        });

        if (result) {
            nameInput.value = '';
            priceInput.value = '';
            this.loadRestaurantManagement();
        } else {
            alert('Failed to add menu item');
        }
    }

    async deleteMenuItem(restaurantId, menuItemId) {
        if (!confirm('Remove this menu item?')) return;

        const result = await this.apiCall(`/admin/restaurant/delete-menu-item/${restaurantId}/${menuItemId}`, 'DELETE');
        if (result) {
            this.loadRestaurantManagement();
        } else {
            alert('Failed to delete menu item');
        }
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new OrderCoApp();
});
