using System;
using System.Collections;
using UnityEngine;
using UnityEngine.UIElements;
using KiemKhaiTienLo.Core;
using KiemKhaiTienLo.Presentation;

namespace KiemKhaiTienLo.App
{
    public sealed class GameApp : MonoBehaviour
    {
        private LocalSave save;
        private GameApi api;
        private RewardedAdsBridge ads;
        private BoardRenderer boardView;
        private BoardEngine board;
        private UIDocument document;
        private VisualElement root;
        private VisualElement screen;
        private VisualElement toast;
        private bool swordTargeting;
        private string notice = "";

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void Launch()
        {
            if (FindFirstObjectByType<GameApp>() != null) return;
            var game = new GameObject("Kiếm Khai Tiên Lộ");
            DontDestroyOnLoad(game);
            game.AddComponent<GameApp>();
        }

        private void Awake()
        {
            Screen.orientation = ScreenOrientation.Portrait;
            Application.targetFrameRate = 60;
            save = new LocalSave();
            api = gameObject.AddComponent<GameApi>();
            ads = gameObject.AddComponent<RewardedAdsBridge>();
            // UI Toolkit overlays a camera display in the Editor's Game view.
            // The camera clears the display; all visible UI surfaces are PNGs.
            if (Camera.main == null)
            {
                var cameraObject = new GameObject("Game Camera");
                cameraObject.tag = "MainCamera";
                var camera = cameraObject.AddComponent<Camera>();
                camera.clearFlags = CameraClearFlags.SolidColor;
                camera.backgroundColor = new Color(.02f, .12f, .15f);
            }
            boardView = new BoardRenderer();
            boardView.Gesture += HandleBoardGesture;
            document = gameObject.AddComponent<UIDocument>();
            document.panelSettings = Resources.Load<PanelSettings>("GamePanel");
            if (document.panelSettings == null)
                document.panelSettings = ScriptableObject.CreateInstance<PanelSettings>();
        }

        private void Start()
        {
            root = document.rootVisualElement;
            var style = Resources.Load<StyleSheet>("Game");
            if (style != null) root.styleSheets.Add(style);
            RenderMap();
            StartCoroutine(api.Bootstrap(() =>
            {
                if (api.RewardedAdsEnabled && api.Online) ads.Activate();
                StartCoroutine(SyncLoop());
            }));
        }

        private IEnumerator SyncLoop()
        {
            int delay = 5;
            while (true)
            {
                if (api.Online)
                {
                    if (!api.HasBootstrap) yield return api.Bootstrap(() => { });
                    if (api.RewardedAdsEnabled) ads.Activate();
                    int previousStars = save.TotalStars;
                    string failure = null;
                    yield return api.Sync(save, error => failure = error);
                    delay = failure == null ? 30 : Mathf.Min(delay * 2, 300);
                    if (failure == null && save.TotalStars != previousStars && board == null &&
                        screen != null && screen.name == "map") RenderMap();
                }
                else delay = 5;
                yield return new WaitForSeconds(delay);
            }
        }

        private void HandleBoardGesture(int x1, int y1, int x2, int y2)
        {
            if (board == null || board.Won || board.Lost) return;
            bool changed;
            if (swordTargeting)
            {
                changed = board.UseSwordQi(y2);
                swordTargeting = false;
            }
            else changed = board.TrySwap(x1, y1, x2, y2);
            if (!changed) return;
            save.SaveBoard(board.Snapshot());
            if (board.Won)
            {
                int stars = board.Moves >= 6 ? 3 : board.Moves >= 2 ? 2 : 1;
                int levelId = board.Level.Id;
                save.Complete(levelId, stars);
                StartCoroutine(api.Sync(save, _ => { }));
                if (levelId == LevelCatalog.Count) RenderRealm();
                else RenderWin(levelId, stars);
            }
            else RenderGame();
        }

        private void StartLevel(int id, bool restart = false)
        {
            if (id < 1 || id > LevelCatalog.Count || id > save.HighestUnlocked) return;
            var previous = !restart && save.Active != null && save.Active.LevelId == id ? save.Active : null;
            board = new BoardEngine(LevelCatalog.Get(id), previous);
            swordTargeting = false;
            notice = "";
            save.SaveBoard(board.Snapshot());
            RenderGame();
        }

        private VisualElement BeginScreen(string name, string background)
        {
            root.Clear();
            screen = new VisualElement { name = name };
            screen.AddToClassList("screen");
            screen.style.backgroundImage = Art(background);
            float scale = Screen.width > 0 ? 1080f / Screen.width : 1f;
            screen.style.paddingTop = 18f + Mathf.Max(0, Screen.height - Screen.safeArea.yMax) * scale;
            screen.style.paddingBottom = 14f + Mathf.Max(0, Screen.safeArea.yMin) * scale;
            root.Add(screen);
            toast = null;
            return screen;
        }

        private void AddHud()
        {
            var hud = new VisualElement(); hud.AddToClassList("hud");
            var avatar = Image("avatar", "avatar"); hud.Add(avatar);
            foreach (string kind in new[] { "jade", "coin", "bolt" })
            {
                var stat = Button("—", () => ShowNotice("Sắp ra mắt"), "panel", "stat");
                stat.Add(Image("icon_" + kind, "stat-icon"));
                hud.Add(stat);
            }
            var menu = Button("", ShowAccount, "panel", "menu-button");
            menu.Add(Image("icon_menu", "menu-icon"));
            hud.Add(menu);
            screen.Add(hud);
        }

        private void AddTitle(string title)
        {
            var banner = ArtBox("banner", "title-banner");
            banner.Add(Label(title, "title"));
            screen.Add(banner);
        }

        private void AddNav(string active)
        {
            var nav = ArtBox("nav", "nav");
            string[] labels = { "TIÊN LỘ", "NHÂN VẬT", "TÚI ĐỒ", "TU LUYỆN" };
            string[] icons = { "map", "person", "bag", "lotus" };
            for (int i = 0; i < labels.Length; i++)
            {
                int index = i;
                Action navAction = index == 0 ? RenderMap : () => ShowNotice("Sắp ra mắt");
                var item = new Button(navAction);
                item.AddToClassList("nav-item");
                if (icons[i] == active) item.AddToClassList("nav-active");
                item.Add(Image("icon_" + icons[i], "nav-icon"));
                item.Add(Label(labels[i], "nav-label"));
                nav.Add(item);
            }
            screen.Add(nav);
        }

        private void RenderMap()
        {
            board = null;
            BeginScreen("map", "bg_map");
            AddHud();
            AddTitle("TIÊN LỘ");
            var map = new VisualElement(); map.AddToClassList("map-area");
            var chapter = ArtBox("panel_light", "chapter-card");
            chapter.Add(Label("CHƯƠNG THỬ NGHIỆM", "chapter-small"));
            chapter.Add(Label("VÂN HẢI\nTIÊN SƠN", "chapter-title"));
            map.Add(chapter);
            for (int id = 1; id <= LevelCatalog.Count; id++)
            {
                int stageId = id;
                bool done = save.Stars(id) > 0;
                bool current = !done && id == save.HighestUnlocked;
                string art = done ? "stage_done" : current ? "stage_current" : "stage_locked";
                var stage = Button(id.ToString(), () => StartLevel(stageId), art, "stage-node");
                stage.AddToClassList("stage-" + id);
                if (!done && !current) stage.SetEnabled(false);
                if (done) stage.Add(Label(new string('★', save.Stars(id)), "stage-stars"));
                map.Add(stage);
            }
            screen.Add(map);
            screen.Add(Button(save.CompletedCount == LevelCatalog.Count ? "CHƠI LẠI BOSS" : "TIẾP TỤC",
                () => StartLevel(save.Active != null ? save.Active.LevelId : save.HighestUnlocked),
                "button_primary", "map-continue"));
            AddNav("map");
        }

        private void RenderGame()
        {
            if (board == null) return;
            bool boss = board.Level.Goal == GoalKind.Boss;
            bool battle = board.Level.Goal == GoalKind.Battle;
            BeginScreen("game", boss ? "bg_boss" : "bg_game");
            AddHud();
            AddTitle(boss ? "YÊU VƯƠNG" : battle ? "YÊU THÚ" : "BÍ CẢNH");
            var stats = new VisualElement(); stats.AddToClassList("game-stats");
            var stage = ArtBox("panel", "stat-card");
            stage.Add(Label("TẦNG", "stat-caption"));
            stage.Add(Label("1-" + board.Level.Id, "stat-number"));
            stats.Add(stage);
            var objective = ArtBox("panel", "objective-card");
            objective.Add(Label(battle || boss ? "MÁU YÊU THÚ" : "MỤC TIÊU", "stat-caption"));
            var objectiveRow = new VisualElement(); objectiveRow.AddToClassList("objective-row");
            objectiveRow.Add(Image(battle || boss ? "icon_skill" : "icon_herb", "objective-icon"));
            objectiveRow.Add(Label(board.Remaining + (battle || boss ? " HP" : "/6"), "objective-number"));
            objective.Add(objectiveRow); stats.Add(objective);
            var moves = ArtBox("panel", "moves-card");
            moves.Add(Label("LƯỢT", "stat-caption"));
            moves.Add(Label(board.Moves.ToString(), "moves-number"));
            stats.Add(moves);
            screen.Add(stats);

            var main = new VisualElement(); main.AddToClassList("game-main");
            if (battle || boss)
            {
                var enemy = Image("beast", "enemy-art");
                if (boss) enemy.AddToClassList("boss-art");
                main.Add(enemy);
                var health = ProgressBar((float)board.Remaining / board.Level.Target, "bar_red", "health-bar");
                main.Add(health);
            }
            var boardSpace = new VisualElement(); boardSpace.AddToClassList("board-space");
            boardSpace.Add(boardView.Element);
            boardSpace.RegisterCallback<GeometryChangedEvent>(_ => SizeBoard(boardSpace));
            main.Add(boardSpace);
            screen.Add(main);
            boardView.UpdateBoard(board);

            var skillArea = ArtBox("panel", "skill-area");
            bool ready = board.SwordQi >= 100;
            var skill = Button("", () =>
            {
                if (!ready || board == null || board.Lost) return;
                swordTargeting = true;
                notice = "Chạm một hàng trên bàn cờ";
                RenderGame();
            }, ready ? "stage_current" : "stage_locked", "skill-button");
            skill.Add(Image("icon_skill", "skill-icon"));
            skillArea.Add(skill);
            var gaugeColumn = new VisualElement(); gaugeColumn.AddToClassList("gauge-column");
            gaugeColumn.Add(Label(ready ? "KIẾM TRẢM SẴN SÀNG" : "KIẾM KHÍ", "gauge-caption"));
            gaugeColumn.Add(ProgressBar(board.SwordQi / 100f, "bar_blue", "qi-bar"));
            gaugeColumn.Add(Label(board.SwordQi + "/100", "gauge-value"));
            skillArea.Add(gaugeColumn);
            screen.Add(skillArea);
            if (!string.IsNullOrEmpty(notice)) screen.Add(Label(notice, "notice"));
            AddNav("map");
            if (board.Lost) AddLossDialog();
        }

        private void SizeBoard(VisualElement available)
        {
            float width = available.resolvedStyle.width - 14f;
            float height = available.resolvedStyle.height - 8f;
            float size = Mathf.Min(950f, width, height);
            if (size > 0)
            {
                boardView.Element.style.width = size;
                boardView.Element.style.height = size;
            }
        }

        private VisualElement ProgressBar(float portion, string fillArt, string className)
        {
            var track = ArtBox("bar_track", className);
            track.AddToClassList("bar-track");
            var fill = ArtBox(fillArt, "bar-fill");
            fill.style.width = Length.Percent(Mathf.Clamp01(portion) * 100f);
            track.Add(fill);
            return track;
        }

        private void AddLossDialog()
        {
            var overlay = new VisualElement(); overlay.AddToClassList("dialog-overlay");
            overlay.style.backgroundImage = Art("dim_overlay");
            var dialog = ArtBox("panel", "dialog-card");
            dialog.Add(Label("HẾT LƯỢT", "title"));
            dialog.Add(Label("Hãy thử lại bí cảnh này", "body"));
            dialog.Add(Button("CHƠI LẠI", () => StartLevel(board.Level.Id, true), "button_primary", "wide-button"));
            if (!board.ExtraMovesUsed && api.Online && api.RewardedAdsEnabled && ads.Ready)
                dialog.Add(Button("XEM QUẢNG CÁO · +3 LƯỢT", RequestExtraMoves,
                    "button_secondary", "wide-button"));
            dialog.Add(Button("VỀ TIÊN LỘ", RenderMap, "button_secondary", "wide-button"));
            overlay.Add(dialog);
            screen.Add(overlay);
        }

        private void RequestExtraMoves()
        {
            BoardEngine currentBoard = board;
            StartCoroutine(api.CreateAdIntent(currentBoard.Level.Id, (intent, error) =>
            {
                if (board != currentBoard) return;
                if (error != null || intent == null)
                { notice = "Quảng cáo chưa sẵn sàng"; RenderGame(); return; }
                ads.Show(intent.customData, rewarded =>
                {
                    if (board != currentBoard) return;
                    if (rewarded && currentBoard.GrantExtraMoves())
                    {
                        save.SaveBoard(currentBoard.Snapshot());
                        notice = "+3 lượt";
                        StartCoroutine(api.CheckAdIntent(intent.intentId, (_, __) => { }));
                    }
                    else notice = "Chưa nhận được phần thưởng";
                    RenderGame();
                });
            }));
        }

        private void RenderWin(int levelId, int stars)
        {
            board = null;
            BeginScreen("win", "bg_game");
            AddHud(); AddTitle("VƯỢT ẢI");
            var card = ArtBox("panel", "center-card");
            card.Add(Label("VƯỢT ẢI THÀNH CÔNG", "subtitle"));
            card.Add(Label(new string('★', stars), "star-result"));
            card.Add(Label("Màn " + levelId + " đã hoàn thành", "body"));
            card.Add(Button("MÀN TIẾP THEO", () => StartLevel(levelId + 1), "button_primary", "wide-button"));
            card.Add(Button("VỀ TIÊN LỘ", RenderMap, "button_secondary", "wide-button"));
            screen.Add(card);
            AddNav("map");
        }

        private void RenderRealm()
        {
            board = null;
            BeginScreen("realm", "bg_realm");
            AddHud(); AddTitle("ĐỘT PHÁ");
            var labels = new VisualElement(); labels.AddToClassList("realm-labels");
            var oldRealm = ArtBox("panel", "realm-step"); oldRealm.Add(Label("LUYỆN KHÍ", "realm-name"));
            var newRealm = ArtBox("panel_light", "realm-step"); newRealm.Add(Label("TRÚC CƠ", "realm-name"));
            labels.Add(oldRealm); labels.Add(Label("»", "realm-arrow")); labels.Add(newRealm);
            screen.Add(labels);
            var heroSpace = new VisualElement(); heroSpace.AddToClassList("hero-space");
            heroSpace.Add(Image("cultivator", "hero-art"));
            screen.Add(heroSpace);
            var card = ArtBox("panel", "realm-bottom");
            card.Add(ProgressBar(1f, "bar_blue", "qi-bar"));
            card.Add(Label("3/3 · Linh khí viên mãn", "gauge-value"));
            card.Add(Button("ĐỘT PHÁ", RenderMap, "button_primary", "realm-action"));
            card.Add(Label("Một vùng đất mới đang chờ phía trước", "small"));
            screen.Add(card);
            AddNav("lotus");
        }

        private void ShowAccount()
        {
            board = null;
            BeginScreen("account", "bg_map");
            AddHud(); AddTitle("TÀI KHOẢN");
            var card = ArtBox("panel", "center-card");
            card.Add(Label(api.Session == null || api.Session.isGuest ?
                "Liên kết để đồng bộ tiến trình" : "Tài khoản đã liên kết", "subtitle"));
            var email = new TextField("Email"); email.AddToClassList("input");
            email.style.backgroundImage = Art("panel");
            var password = new TextField("Mật khẩu") { isPasswordField = true }; password.AddToClassList("input");
            password.style.backgroundImage = Art("panel");
            card.Add(email); card.Add(password);
            var status = Label("", "small"); card.Add(status);
            card.Add(Button("TẠO TÀI KHOẢN", () => StartCoroutine(api.Register(email.value, password.value,
                error => AccountResult(error, status))), "button_primary", "wide-button"));
            card.Add(Button("ĐĂNG NHẬP", () => StartCoroutine(api.Login(email.value, password.value,
                error => AccountResult(error, status))), "button_secondary", "wide-button"));
            card.Add(Button("QUAY LẠI", RenderMap, "button_secondary", "wide-button"));
            card.Add(Label("Bản thử nghiệm chưa có khôi phục mật khẩu.", "small"));
            screen.Add(card);
            AddNav("map");
        }

        private void AccountResult(string error, Label status)
        {
            if (error != null) { status.text = "Không thể đăng nhập: " + error; return; }
            StartCoroutine(api.Sync(save, _ => RenderMap()));
        }

        private void ShowNotice(string message)
        {
            if (screen == null) return;
            toast?.RemoveFromHierarchy();
            toast = ArtBox("panel", "toast");
            toast.Add(Label(message, "body"));
            screen.Add(toast);
            var shown = toast;
            shown.schedule.Execute(() => { if (toast == shown) { shown.RemoveFromHierarchy(); toast = null; } })
                .StartingIn(1900);
        }

        private void OnApplicationPause(bool paused)
        {
            if (paused && board != null && !board.Won) save.SaveBoard(board.Snapshot());
        }

        private static Texture2D Art(string name) => Resources.Load<Texture2D>("UI/" + name);

        private static VisualElement ArtBox(string art, string className)
        {
            var box = new VisualElement(); box.AddToClassList(className);
            box.style.backgroundImage = Art(art);
            return box;
        }

        private static Image Image(string art, string className)
        {
            var image = new Image { image = Art(art), scaleMode = ScaleMode.ScaleToFit,
                pickingMode = PickingMode.Ignore };
            image.AddToClassList(className);
            return image;
        }

        private static Label Label(string text, string className)
        {
            var label = new Label(text); label.AddToClassList(className); return label;
        }

        private static Button Button(string text, Action action, string art, string className)
        {
            var button = new Button(action) { text = text };
            button.AddToClassList(className);
            button.style.backgroundImage = Art(art);
            return button;
        }
    }
}
